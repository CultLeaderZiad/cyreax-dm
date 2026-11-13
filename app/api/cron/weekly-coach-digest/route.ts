export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { captureException } from "@/lib/monitoring"
import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { generateCompletion, isAgentEnabled } from "@/lib/llm-provider"
import { BRAND } from "@/lib/brand"

/**
 * GET /api/cron/weekly-coach-digest
 *
 * Implements the `weekly_coach_digest` agent that previously existed ONLY as a
 * database row (no cron, no runtime). Runs daily and generates a digest for
 * any account that doesn't have one for the current ISO week yet (this keeps
 * it compatible with Vercel Hobby's daily-cron-only limit while still being a
 * weekly digest).
 *
 * Fails closed unless Authorization is `Bearer $CRON_SECRET`.
 */

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - (day - 1)) // Monday of this week
  return date.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const denied = unauthorizedCronResponse(request)
    if (denied) return denied

    const supabase = await getSupabaseBypassClient()
    const weekStart = isoWeekStart(new Date())
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Accounts that had ANY activity in the last 7 days
    const { data: activeAccounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id")
      .neq("role", "admin")
      .limit(500)

    if (accountsError) throw new Error(accountsError.message)
    if (!activeAccounts || activeAccounts.length === 0) {
      return NextResponse.json({ ok: true, generated: 0, reason: "no accounts" })
    }

    let generated = 0
    let skipped = 0

    for (const account of activeAccounts) {
      try {
        // Skip if a digest already exists for this ISO week
        const { data: existing } = await supabase
          .from("ai_coach_digests")
          .select("id")
          .eq("account_id", account.id)
          .eq("week_start", weekStart)
          .maybeSingle()

        if (existing) {
          skipped++
          continue
        }

        // Respect the agent toggle
        const enabled = await isAgentEnabled(account.id, "weekly_coach_digest")
        if (!enabled) {
          skipped++
          continue
        }

        // Resolve the business user row for this account
        const { data: bizUser } = await supabase
          .from("users")
          .select("id")
          .eq("account_id", account.id)
          .maybeSingle()

        if (!bizUser?.id) {
          skipped++
          continue
        }

        const [eventsRes, messagesRes, convsRes] = await Promise.all([
          supabase.from("automation_events").select("event_type, platform").eq("user_id", bizUser.id).gte("created_at", sevenDaysAgo),
          supabase.from("messages").select("*", { count: "exact", head: true }).eq("user_id", bizUser.id).gte("created_at", sevenDaysAgo),
          supabase.from("conversations").select("*", { count: "exact", head: true }).eq("user_id", bizUser.id).gte("last_message_at", sevenDaysAgo),
        ])

        const events = eventsRes.data || []
        const byType: Record<string, number> = {}
        for (const ev of events) byType[ev.event_type] = (byType[ev.event_type] || 0) + 1

        const metrics = {
          events: events.length,
          eventsByType: byType,
          messages: messagesRes.count || 0,
          conversations: convsRes.count || 0,
        }

        // No activity → nothing worth summarising
        if (metrics.events === 0 && metrics.messages === 0 && metrics.conversations === 0) {
          skipped++
          continue
        }

        const digest = await generateCompletion(
          String(bizUser.id),
          account.id,
          "weekly_digest",
          "weekly_coach_digest",
          {
            messages: [
              {
                role: "system",
                content: `You are ${BRAND.name}'s Weekly Coach. Write a short, encouraging performance digest for a creator based ONLY on their real numbers below.
Rules:
- 120 words max, plain text with 3-4 bullet points.
- Reference the actual numbers. Never invent metrics.
- End with ONE concrete recommended action for next week.`,
              },
              {
                role: "user",
                content: `Last 7 days on this account:
- Automated events: ${metrics.events} ${JSON.stringify(byType)}
- Messages sent/received: ${metrics.messages}
- Active conversations: ${metrics.conversations}`,
              },
            ],
            temperature: 0.4,
            max_tokens: 320,
          }
        )

        if (!digest) {
          skipped++
          continue
        }

        const { error: insertError } = await supabase.from("ai_coach_digests").insert({
          account_id: account.id,
          week_start: weekStart,
          content: digest,
          metrics,
        })

        if (insertError) {
          console.warn(`[weekly-digest] Insert failed for account ${account.id}:`, insertError.message)
          skipped++
        } else {
          generated++
        }
      } catch (perAccountErr) {
        console.warn(`[weekly-digest] Skipping account ${account.id}:`, perAccountErr)
        skipped++
      }
    }

    return NextResponse.json({ ok: true, week_start: weekStart, generated, skipped })
  } catch (error: any) {
    console.error("[weekly-digest] Error:", error)
    void captureException(error, { route: "cron/weekly-coach-digest" })
    return NextResponse.json({ error: error.message || "Failed to generate digests" }, { status: 500 })
  }
}
