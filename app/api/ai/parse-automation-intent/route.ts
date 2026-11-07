export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { aiErrorResponse } from "@/lib/ai-errors"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"
import { generateGroqCompletion } from "@/lib/groq-client"

export async function POST(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    const { user: account, igUser } = result

    const { description } = await request.json()
    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 })
    }

    const messages = [
      {
        role: "system",
        content: `You are an expert AI assistant that translates plain-language descriptions into structured Instagram automation rules.
The user will provide a description of what they want to automate (e.g., "when people comment 'price' send them my price list").
Your task is to parse this into a JSON object with the following fields:
- trigger_source: either "comment", "dm", or "story"
- trigger_type: usually "keyword", or "reply_all"
- trigger_value: a comma-separated list of keywords, or empty string if reply_all
- response_type: either "text", "card", or "media"
- draft_response_content: the message text to send

Return ONLY a valid JSON object. Do not include markdown formatting or explanation.`
      },
      {
        role: "user",
        content: `Description: "${description}"`
      }
    ]

    const completion = await generateGroqCompletion(account.id, "parse_intent", {
      messages: messages as any,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" }
    })

    if (!completion) {
      return NextResponse.json({ error: "Failed to generate response or rate limit exceeded" }, { status: 429 })
    }

    let parsed = null
    try {
      parsed = JSON.parse(completion)
    } catch {
      parsed = JSON.parse(completion.replace(/^[\[\]`]/gm, "").replace(/^json/gm, ""))
    }

    return NextResponse.json(parsed)

  } catch (error: any) {
    console.error("[parse-automation-intent] Server error:", error)
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    return NextResponse.json({ error: "Something went wrong parsing your request. Please try again." }, { status: 500 })
  }
}
