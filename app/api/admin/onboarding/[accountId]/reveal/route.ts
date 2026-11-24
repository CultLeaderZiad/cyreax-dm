export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { openAccessToken } from "@/lib/token-crypto"

/** Shows the customer's Telegram bot token to an admin who needs it to connect the bot. Nothing else ever returns it in clear. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const admin = await requireAdmin(request)
  if (admin.response) return admin.response
  const { accountId } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return NextResponse.json({ error: "Unknown account" }, { status: 400 })
  const supabase = await getSupabaseBypassClient()
  const { data } = await supabase.from("account_onboarding").select("telegram_bot_token").eq("account_id", accountId).maybeSingle()
  if (!data?.telegram_bot_token) return NextResponse.json({ error: "No token on file" }, { status: 404 })
  try {
    return NextResponse.json({ token: openAccessToken(data.telegram_bot_token) }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not decrypt the token" }, { status: 500 })
  }
}
