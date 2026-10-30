export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { refreshTikTokTokens } from "@/lib/tiktok/oauth"

export { refreshTikTokTokens }

/**
 * GET /api/cron/refresh-tiktok-tokens
 * Access tokens last about a day. Refresh any TikTok row inside two hours of expiry.
 * Fails closed without CRON_SECRET. Skips cleanly before the phase 4 columns exist.
 */
export async function GET(request: NextRequest) {
  const denied = unauthorizedCronResponse(request)
  if (denied) return denied

  const supabase = await getSupabaseBypassClient()
  const result = await refreshTikTokTokens(supabase)
  if (!result.ok && result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
