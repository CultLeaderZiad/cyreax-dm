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

    const { automationId, text, context } = await request.json()
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 })
    }

    const messages = [
      {
        role: "system",
        content: `You are an expert social media copywriter. The user will provide a draft auto-reply message. 
Your task is to generate exactly 3 alternative, high-converting phrasings. Keep the tone engaging and concise.
Return ONLY a JSON array of 3 strings. Do not include markdown formatting or explanation.`
      },
      {
        role: "user",
        content: `Draft message: "${text}"\n${context ? `Additional context: ${context}` : ''}`
      }
    ]

    const completion = await generateGroqCompletion(account.id, "copy_suggestion", {
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 300
    })

    if (!completion) {
      return NextResponse.json({ error: "Failed to generate suggestions or rate limit exceeded" }, { status: 429 })
    }

    let suggestions: string[] = []
    try {
      suggestions = JSON.parse(completion)
      if (!Array.isArray(suggestions)) throw new Error("Not an array")
    } catch {
      // Fallback parser if Groq didn't return perfect JSON
      suggestions = completion
        .replace(/^[\[\]`]/gm, "")
        .split("\n")
        .filter((line: string) => line.trim().startsWith('"') || line.trim().length > 5)
        .map((line: string) => line.replace(/^["'-]?\s*/, "").replace(/["',]?$/, ""))
        .slice(0, 3)
    }

    // Save suggestions to database
    if (automationId && suggestions.length > 0) {
      const supabase = await getSupabaseBypassClient()
      const rows = suggestions.map((s) => ({
        user_id: account.id,
        automation_id: automationId,
        prompt_context: text,
        suggested_text: s,
        accepted: null
      }))

      const { data, error } = await supabase.from("ai_copy_suggestions").insert(rows).select("id")
      if (error) {
        console.error("[copy-suggestion] DB Error:", error)
      } else {
        // Zip IDs into suggestions if we want the UI to be able to mark them accepted later
        const suggestionsWithIds = suggestions.map((s, i) => ({
          id: data?.[i]?.id,
          text: s
        }))
        return NextResponse.json({ suggestions: suggestionsWithIds })
      }
    }

    // Fallback if no automationId or DB insert failed
    return NextResponse.json({ suggestions: suggestions.map(s => ({ text: s })) })

  } catch (error: any) {
    console.error("[copy-suggestion] Server error:", error)
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    return NextResponse.json({ error: "Something went wrong generating suggestions. Please try again." }, { status: 500 })
  }
}

// Endpoint to mark a suggestion as accepted
export async function PATCH(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    const { user: account, igUser } = result

    const { suggestionId, accepted } = await request.json()
    if (!suggestionId) return NextResponse.json({ error: "Suggestion ID is required" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()
    const { error } = await supabase
      .from("ai_copy_suggestions")
      .update({ accepted })
      .eq("id", suggestionId)
      .eq("user_id", account.id)

    if (error) {
      console.error("[copy-suggestion] Patch error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[copy-suggestion] Patch server error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}

