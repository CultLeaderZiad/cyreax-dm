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

    const { automationId, keywords, intent } = await request.json()
    if (!keywords) {
      return NextResponse.json({ error: "Keywords are required" }, { status: 400 })
    }

    const messages = [
      {
        role: "system",
        content: `You are an expert social media strategist. The user has provided some trigger keywords for an automation.
Your task is to generate exactly 1 comma-separated string containing the original keywords PLUS 3-5 useful variations, common typos, or synonyms that match the user's intent.
Return ONLY the comma-separated string. No markdown, no explanations.`
      },
      {
        role: "user",
        content: `Original keywords: "${keywords}"\n${intent ? `Automation intent: ${intent}` : ''}`
      }
    ]

    const completion = await generateGroqCompletion(account.id, "keyword_suggestion", {
      messages: messages as any,
      temperature: 0.6,
      max_tokens: 150
    })

    if (!completion) {
      return NextResponse.json({ error: "Failed to generate suggestions or rate limit exceeded" }, { status: 429 })
    }

    // Clean up the output string just in case, then split into an array
    const cleaned = completion.replace(/^["'`]|["'`]$/g, '').trim()
    const suggestedKeywords = cleaned
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)

    // Save suggestion to database (suggested_keywords is an array column)
    if (automationId) {
      const supabase = await getSupabaseBypassClient()
      const { data, error } = await supabase.from("ai_keyword_suggestions").insert({
        user_id: account.id,
        automation_id: automationId,
        suggested_keywords: suggestedKeywords,
        accepted: null
      }).select("id").single()

      if (error) {
        console.error("[keyword-suggestion] DB Error:", error)
      } else {
        return NextResponse.json({
          suggestion: { id: data.id, text: cleaned }
        })
      }
    }

    return NextResponse.json({ suggestion: { text: cleaned } })

  } catch (error: any) {
    console.error("[keyword-suggestion] Server error:", error)
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    return NextResponse.json({ error: "Something went wrong generating keywords. Please try again." }, { status: 500 })
  }
}

// Endpoint to mark a keyword suggestion as accepted
export async function PATCH(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    const { user: account, igUser } = result

    const { suggestionId, accepted } = await request.json()
    if (!suggestionId) return NextResponse.json({ error: "Suggestion ID is required" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()
    const { error } = await supabase
      .from("ai_keyword_suggestions")
      .update({ accepted })
      .eq("id", suggestionId)
      .eq("user_id", account.id)

    if (error) {
      console.error("[keyword-suggestion] Patch error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[keyword-suggestion] Patch server error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}

