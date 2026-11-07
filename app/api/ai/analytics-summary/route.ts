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

    const supabase = await getSupabaseBypassClient()

    // Fetch automation events from the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: events, error } = await supabase
      .from("automation_events")
      .select("event_type, platform")
      .eq("user_id", igUser?.id || account.id)
      .gte("created_at", thirtyDaysAgo.toISOString())

    if (error) {
      console.error("[analytics-summary] DB Error:", error)
      return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
    }

    // Aggregate data
    const counts = {
      total: events.length,
      byPlatform: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    }

    for (const event of events) {
      counts.byPlatform[event.platform] = (counts.byPlatform[event.platform] || 0) + 1
      counts.byType[event.event_type] = (counts.byType[event.event_type] || 0) + 1
    }

    const dataContext = `
Over the last 30 days:
Total automated responses sent: ${counts.total}
Breakdown by Platform: ${JSON.stringify(counts.byPlatform)}
Breakdown by Event Type (e.g. comment_dm, dm_reply): ${JSON.stringify(counts.byType)}
`

    const messages: any[] = [
      {
        role: "system",
        content: `You are an AI growth assistant analyzing automation performance for a social media brand. 
Review the provided data and return a compact, plain-language summary followed by 2-3 actionable suggestions for improving engagement or optimizing automations. Keep it concise, friendly, and under 150 words total. Do not use markdown headers, just plain text.`
      },
      {
        role: "user",
        content: dataContext
      }
    ]

    const completion = await generateGroqCompletion(account.id, "analytics_summary", {
      messages,
      temperature: 0.5,
      max_tokens: 300
    })

    if (!completion) {
      return NextResponse.json({ error: "Failed to generate AI summary" }, { status: 500 })
    }

    return NextResponse.json({ summary: completion })

  } catch (error: any) {
    console.error("[analytics-summary] Server error:", error)
    
    const aiError = aiErrorResponse(error)
    if (aiError) return aiError
    
    return NextResponse.json({ error: "Something went wrong generating analytics. Please try again." }, { status: 500 })
  }
}

