export const maxDuration = 60
export const dynamic = 'force-dynamic'
import { captureException } from "@/lib/monitoring"
import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { sendCampaign } from "@/lib/campaign-sender"

/**
 * GET /api/cron/send-scheduled-campaigns
 * Periodically called via cron job to process scheduled email campaigns.
 */
export async function GET(request: NextRequest) {
  try {
    const denied = unauthorizedCronResponse(request)
    if (denied) return denied

    const supabase = await getSupabaseBypassClient()
    const now = new Date().toISOString()

    // 1. Fetch campaigns that are scheduled and whose scheduled time has passed
    const { data: campaigns, error } = await supabase
      .from("email_campaigns")
      .select("id, name")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)

    if (error) {
      console.error("[cron/send-scheduled-campaigns] Supabase query error:", error)
      void captureException(error, { route: "cron/send-scheduled-campaigns" })
      return NextResponse.json({ error: "Failed to fetch scheduled campaigns" }, { status: 500 })
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ ok: true, message: "No scheduled campaigns to send at this time." })
    }

    console.log(`[cron/send-scheduled-campaigns] Found ${campaigns.length} campaigns to send.`)

    const results = []
    for (const campaign of campaigns) {
      try {
        console.log(`[cron/send-scheduled-campaigns] Sending campaign: ${campaign.name} (${campaign.id})`)
        const result = await sendCampaign(campaign.id, supabase)
        results.push({ id: campaign.id, name: campaign.name, success: true, ...result })
      } catch (err: any) {
        console.error(`[cron/send-scheduled-campaigns] Failed to send campaign ${campaign.id}:`, err)
        void captureException(err, { route: "cron/send-scheduled-campaigns" })
        results.push({ id: campaign.id, name: campaign.name, success: false, error: err.message || "Unknown error" })
      }
    }

    return NextResponse.json({ ok: true, processed: campaigns.length, results })
  } catch (err: any) {
    console.error("[cron/send-scheduled-campaigns] Server error:", err)
    void captureException(err, { route: "cron/send-scheduled-campaigns" })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
