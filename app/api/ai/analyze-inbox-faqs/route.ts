export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { aiErrorResponse } from "@/lib/ai-errors"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"
import { generateCompletion } from "@/lib/llm-provider"

// GET: fetch current FAQ suggestions (re-analyze if stale or ?force=true)
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
      .select("ai_faq_last_analyzed_at")
      .eq("account_id", account.id)
      .single()

    const lastAnalyzed = (!userError && userData) ? userData.ai_faq_last_analyzed_at : null;
    const isStale = !lastAnalyzed || (new Date().getTime() - new Date(lastAnalyzed).getTime() > 24 * 60 * 60 * 1000)

    // Return cached data if within 24h and not forced
    if (!isStale && !force) {
      const { data: faqs } = await supabase
        .from("ai_faq_suggestions")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .eq("is_dismissed", false)
        .order("count", { ascending: false })
      return NextResponse.json({ faqs: faqs || [], last_analyzed_at: lastAnalyzed, is_stale: false })
    }

    // Fetch recent DMs (last 14 days)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const ownerId = igUser?.id || account.id
    let messagesResult = await supabase
      .from("messages")
      .select("content")
      .eq("user_id", ownerId)
      .eq("direction", "in")
      .gte("created_at", fourteenDaysAgo.toISOString())
    if (messagesResult.error && /direction/i.test(messagesResult.error.message || "")) {
      messagesResult = await supabase
        .from("messages")
        .select("content")
        .eq("user_id", ownerId)
        .eq("is_from_instagram", true)
        .gte("created_at", fourteenDaysAgo.toISOString())
    }
    const { data: messagesData, error: messagesError } = messagesResult

    if (messagesError) {
      console.error("Messages query failed (schema might not be ready):", messagesError.message)
    }

    const dmMessages = (!messagesError && messagesData) ? messagesData.map(m => m.content).filter(c => c && c.length > 3) : []

    if (dmMessages.length === 0) {
      const { data: existingFaqs } = await supabase
        .from("ai_faq_suggestions")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .eq("is_dismissed", false)
        .order("count", { ascending: false })
      return NextResponse.json({
        faqs: existingFaqs || [],
        last_analyzed_at: lastAnalyzed,
        is_stale: isStale,
        message: "Not enough DM data to analyze."
      })
    }

    const messages = [
      {
        role: "system",
        content: `You are an expert customer support analyst. Group the following Instagram Direct Messages into 3-5 frequently asked questions (FAQs).
For each FAQ provide:
1. "question": A generalized question
2. "suggested_answer": A friendly, helpful drafted response
3. "count": Estimated number of similar messages

Return ONLY a valid JSON object with a "faqs" array.`
      },
      {
        role: "user",
        content: `Messages to analyze:\n${dmMessages.slice(0, 100).join("\n")}`
      }
    ]

    const completion = await generateCompletion(
      String(account.id),
      igUser?.id || account.id, // accountId
      "analyze_faqs",
      "faq_detector", // agentKey
      {
        messages: messages as any,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" }
      }
    )

    if (!completion) {
      const { data: existingFaqs } = await supabase
        .from("ai_faq_suggestions")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .eq("is_dismissed", false)
        .order("count", { ascending: false })
      return NextResponse.json({ faqs: existingFaqs || [], last_analyzed_at: lastAnalyzed, is_stale: true, error: "Rate limit or AI unavailable" })
    }

    let parsed: any[] = []
    try {
      const maybeParsed = JSON.parse(completion)
      parsed = Array.isArray(maybeParsed) ? maybeParsed : (maybeParsed.faqs || Object.values(maybeParsed)[0] as any[])
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }

    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      await supabase.from("ai_faq_suggestions").delete().eq("user_id", igUser?.id || account.id)

      const rows = parsed.map(f => ({
        user_id: account.id,
        question: f.question || "Unknown Question",
        suggested_answer: f.suggested_answer || "",
        count: f.count || 1,
        is_dismissed: false
      }))

      await supabase.from("ai_faq_suggestions").insert(rows)
      const now = new Date().toISOString()
      await supabase.from("users").update({ ai_faq_last_analyzed_at: now }).eq("account_id", account.id)

      const { data: faqs } = await supabase
        .from("ai_faq_suggestions")
        .select("*")
        .eq("user_id", igUser?.id || account.id)
        .eq("is_dismissed", false)
        .order("count", { ascending: false })
      return NextResponse.json({ faqs: faqs || [], last_analyzed_at: now, is_stale: false })
    }

    return NextResponse.json({ faqs: [], last_analyzed_at: lastAnalyzed, is_stale: isStale })

  } catch (error: any) {
    console.error("[analyze-inbox-faqs] GET error:", error)
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    return NextResponse.json({ error: "Something went wrong analyzing FAQs. Please try again." }, { status: 500 })
  }
}

// POST: force re-analyze
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  url.searchParams.set("force", "true")
  return GET(new Request(url.toString(), { headers: request.headers }) as NextRequest)
}

// PATCH: dismiss an FAQ
export async function PATCH(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    const { user: account, igUser } = result

    const { faqId, dismiss } = await request.json()
    if (!faqId) return NextResponse.json({ error: "FAQ ID is required" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()
    const { error } = await supabase
      .from("ai_faq_suggestions")
      .update({ is_dismissed: dismiss ?? true })
      .eq("id", faqId)
      .eq("user_id", igUser?.id || account.id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[analyze-inbox-faqs] PATCH error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}

