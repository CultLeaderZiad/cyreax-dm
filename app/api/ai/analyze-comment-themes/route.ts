export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { aiErrorResponse } from "@/lib/ai-errors"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"
import { generateCompletion } from "@/lib/llm-provider"
import { commentTextsFromPayload } from "@/lib/event-pipeline"

// GET: fetch current themes (and re-analyze if 24h+ old or ?force=true)
export async function GET(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    const { user: account, igUser } = result

    const supabase = await getSupabaseBypassClient()
    const { searchParams } = new URL(request.url)
    const force = searchParams.get("force") === "true"

    // Rate Limit Check (24 hours) - gracefully handle missing columns
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("ai_themes_last_analyzed_at")
      .eq("account_id", account.id)
      .single()

    const lastAnalyzed = (!userError && userData) ? userData.ai_themes_last_analyzed_at : null;
    const isStale = !lastAnalyzed || (new Date().getTime() - new Date(lastAnalyzed).getTime() > 24 * 60 * 60 * 1000)

    // If within 24h and not forced, return cached results
    if (!isStale && !force) {
      const { data: themes } = await supabase
        .from("ai_comment_themes")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .order("count", { ascending: false })
      return NextResponse.json({ themes: themes || [], last_analyzed_at: lastAnalyzed, is_stale: false })
    }

    // Otherwise do full analysis
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const { data: events, error: eventsError } = await supabase
      .from("webhook_events")
      .select("data")
      .eq("user_id", igUser?.id || account.id)
      .gte("processed_at", fourteenDaysAgo.toISOString())

    if (eventsError) {
      console.error("Webhook events query failed (schema might not be ready):", eventsError.message)
    }

    const fromWebhook = (!eventsError && events) ? events
      ?.filter(e => e.data?.field === "comments" || e.data?.object === "instagram")
      .map(e => e.data?.value?.text || e.data?.text || "")
      .filter(text => text && typeof text === "string" && text.length > 2) || [] : []

    const accountKeys = [igUser?.business_account_id, igUser?.page_id]
      .filter(Boolean)
      .map((id: string | number) => `instagram:${id}`)
    let fromQueue: string[] = []
    if (accountKeys.length > 0) {
      const inbound = await supabase
        .from("inbound_events")
        .select("payload")
        .eq("platform", "instagram")
        .eq("status", "done")
        .in("account_key", accountKeys)
        .gte("created_at", fourteenDaysAgo.toISOString())
        .limit(500)
      if (!inbound.error && inbound.data) {
        fromQueue = inbound.data.flatMap((row: { payload: unknown }) => commentTextsFromPayload(row.payload))
      }
    }

    const comments = [...fromWebhook, ...fromQueue]

    if (comments.length === 0) {
      const { data: existingThemes } = await supabase
        .from("ai_comment_themes")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .order("count", { ascending: false })
      return NextResponse.json({
        themes: existingThemes || [],
        last_analyzed_at: lastAnalyzed,
        is_stale: isStale,
        message: "Not enough comment data to analyze."
      })
    }

    const messages = [
      {
        role: "system",
        content: `You are an expert data analyst. Group the following Instagram comments into 3-5 distinct "themes". 
For each theme provide:
1. "theme": A short title
2. "keywords": A comma-separated list of 2-4 keywords representing the theme
3. "examples": A representative quote or short summary of the comments in this theme
4. "count": Estimated number of comments in this theme

Return ONLY a valid JSON object with a "themes" array.`
      },
      {
        role: "user",
        content: `Comments to analyze:\n${comments.slice(0, 100).join("\n")}`
      }
    ]

    const completion = await generateCompletion(
      String(account.id),
      igUser?.id || account.id, // accountId
      "analyze_themes",
      "comment_themes", // agentKey
      {
        messages: messages as any,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" }
      }
    )

    if (!completion) {
      const { data: existingThemes } = await supabase
        .from("ai_comment_themes")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .order("count", { ascending: false })
      return NextResponse.json({ themes: existingThemes || [], last_analyzed_at: lastAnalyzed, is_stale: true, error: "Rate limit or AI unavailable" })
    }

    let parsed: any[] = []
    try {
      const maybeParsed = JSON.parse(completion)
      parsed = Array.isArray(maybeParsed) ? maybeParsed : (maybeParsed.themes || Object.values(maybeParsed)[0] as any[])
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }

    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      await supabase.from("ai_comment_themes").delete().eq("user_id", igUser?.id || account.id)

      const themeUserId = igUser?.id || account.id
      const rows = parsed.map(t => ({
        user_id: themeUserId,
        theme: t.theme || "General",
        keywords: t.keywords || "",
        examples: t.examples || "",
        count: t.count || 1
      }))

      await supabase.from("ai_comment_themes").insert(rows)
      const now = new Date().toISOString()
      await supabase.from("users").update({ ai_themes_last_analyzed_at: now }).eq("account_id", account.id)

      const { data: themes } = await supabase
        .from("ai_comment_themes")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .order("count", { ascending: false })
      return NextResponse.json({ themes: themes || [], last_analyzed_at: now, is_stale: false })
    }

    return NextResponse.json({ themes: [], last_analyzed_at: lastAnalyzed, is_stale: isStale })

  } catch (error: any) {
    console.error("[analyze-comment-themes] GET error:", error)
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    return NextResponse.json({ error: "Something went wrong analyzing themes. Please try again." }, { status: 500 })
  }
}

// POST: force re-analyze
export async function POST(request: NextRequest) {
  // Delegate to GET with force=true
  const url = new URL(request.url)
  url.searchParams.set("force", "true")
  return GET(new Request(url.toString(), { headers: request.headers }) as NextRequest)
}

