export const dynamic = "force-dynamic"
export const maxDuration = 60

import { captureException } from "@/lib/monitoring"
import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { drainInboundEvents } from "@/lib/inbound-worker"

/**
 * GET /api/cron/process-inbound-events
 *
 * Safety net for the inbound queue. Webhooks also drain via `after()` once
 * the row is stored, so a delivery is not stuck waiting for the next minute.
 * Failures, rate-limit defers, and a crashed drain are picked up here.
 *
 * Vercel invokes this with `Authorization: Bearer $CRON_SECRET`.
 * A every-minute schedule needs a plan that allows it (Vercel Pro). On Hobby,
 * point any external cron at this path with the same bearer token.
 */
export async function GET(request: NextRequest) {
  const denied = unauthorizedCronResponse(request)
  if (denied) return denied

  try {
    const supabase = await getSupabaseBypassClient()
    const summary = await drainInboundEvents(supabase)
    let flows = { claimed: 0, done: 0, retried: 0, dead: 0, errors: [] as string[] }
    try {
      const { drainFlowJobs } = await import("@/lib/flows/runtime")
      flows = await drainFlowJobs(supabase)
    } catch (error: any) {
      console.error("[inbound] flow drain failed:", error)
      void captureException(error, { route: "cron/process-inbound-events" })
      summary.errors.push(error?.message || "flow drain failed")
    }
    let webhooks = { done: 0, retried: 0, dead: 0 }
    try {
      const { drainOutgoingWebhooks } = await import("@/lib/integrations/drain")
      webhooks = await drainOutgoingWebhooks(supabase)
    } catch (error: any) {
      console.error("[inbound] webhook drain failed:", error)
      void captureException(error, { route: "cron/process-inbound-events" })
      summary.errors.push(error?.message || "webhook drain failed")
    }
    // Rate-limit counters: one row per client key, so without this the table
    // grows with every new IP that ever called us. The longest window in use is
    // one day; anything idle for two days is safe to drop.
    await supabase
      .from("inbound_rate_buckets")
      .delete()
      .like("account_key", "abuse:%")
      .lt("window_start", new Date(Date.now() - 2 * 86_400_000).toISOString())
      .then(() => undefined, () => undefined)
    // Send-once claims older than 30 days can never be retried against.
    await supabase
      .from("outbound_sends")
      .delete()
      .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .then(() => undefined, () => undefined)
    return NextResponse.json({ ...summary, flows, webhooks })
  } catch (error: any) {
    console.error("[cron/process-inbound-events]", error)
    void captureException(error, { route: "cron/process-inbound-events" })
    return NextResponse.json({ error: error?.message || "Drain failed" }, { status: 500 })
  }
}
