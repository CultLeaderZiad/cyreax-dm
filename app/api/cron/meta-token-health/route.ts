export const dynamic = "force-dynamic"
export const maxDuration = 60

import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { isPlaceholderToken, openAccessToken } from "@/lib/token-crypto"
import { probeToken } from "@/lib/meta/token-health"
import { captureException } from "@/lib/monitoring"

/**
 * GET /api/cron/meta-token-health
 *
 * Facebook Page and WhatsApp tokens have no refresh flow; they die when the
 * owner changes a password, removes the app, or a temporary token expires.
 * This probes each connection and sets metadata.reconnect_required so the
 * Channels page shows "Reconnect required" instead of replies silently failing.
 * Only a definite "token is dead" answer flips the flag; outages do not.
 */
export async function GET(request: NextRequest) {
  const denied = unauthorizedCronResponse(request)
  if (denied) return denied
  try {
    const supabase = await getSupabaseBypassClient()
    const { data, error } = await supabase
      .from("platform_connections")
      .select("id, platform, page_id, access_token, metadata")
      .in("platform", ["facebook", "messenger", "whatsapp", "instagram"])
      .limit(300)
    if (error) throw new Error(error.message)

    const counts = { checked: 0, ok: 0, dead: 0, unknown: 0, skipped: 0 }
    for (const row of data || []) {
      if ((row.metadata as any)?.is_user_profile) { counts.skipped++; continue }
      let token: string | null = null
      try { token = openAccessToken(row.access_token) } catch { token = null }
      if (!token || isPlaceholderToken(token)) { counts.skipped++; continue }
      counts.checked++
      const verdict = await probeToken(row.platform, row.page_id, token)
      counts[verdict]++
      const flagged = Boolean((row.metadata as any)?.reconnect_required)
      if ((verdict === "dead") !== flagged && verdict !== "unknown") {
        await supabase
          .from("platform_connections")
          .update({ metadata: { ...((row.metadata as object) || {}), reconnect_required: verdict === "dead" } })
          .eq("id", row.id)
      }
    }
    return NextResponse.json(counts)
  } catch (error: any) {
    await captureException(error, { route: "cron/meta-token-health" })
    return NextResponse.json({ error: "token health check failed" }, { status: 500 })
  }
}
