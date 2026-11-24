export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { maskToken } from "@/lib/onboarding"
import { openAccessToken } from "@/lib/token-crypto"

const NEW_SIGNUP_WINDOW_MS = 14 * 86_400_000

/**
 * Admin -> Onboarding: every customer who submitted their details, plus
 * customers who created an account recently and have not filled the form yet,
 * so a new signup is never invisible.
 */
export async function GET() {
  const admin = await requireAdmin()
  if (admin.response) return admin.response
  const supabase = await getSupabaseBypassClient()

  const [{ data: rows, error }, { data: recent }] = await Promise.all([
    supabase.from("account_onboarding").select("*").order("submitted_at", { ascending: false }).limit(500),
    supabase
      .from("accounts")
      .select("id, email, created_at, role, is_team_member")
      .gte("created_at", new Date(Date.now() - NEW_SIGNUP_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(200),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const submittedIds = new Set((rows || []).map((r: any) => r.account_id))
  const ids = [...new Set([...submittedIds, ...(recent || []).map((a: any) => a.id)])]
  const { data: accounts } = ids.length ? await supabase.from("accounts").select("id, email, created_at").in("id", ids) : { data: [] }
  const byId = new Map((accounts || []).map((a: any) => [a.id, a]))

  const submitted = (rows || []).map((r: any) => {
    let token: string | null = null
    try { token = r.telegram_bot_token ? openAccessToken(r.telegram_bot_token) : null } catch { token = null }
    return {
      accountId: r.account_id,
      email: byId.get(r.account_id)?.email || null,
      accountCreatedAt: byId.get(r.account_id)?.created_at || null,
      state: r.status,
      fullName: r.full_name || null,
      company: r.company,
      instagramUsername: r.instagram_username,
      facebookId: r.facebook_id,
      telegramToken: maskToken(token),
      note: r.admin_note,
      submittedAt: r.submitted_at,
      seen: Boolean(r.admin_seen_at),
    }
  })
  const awaiting = (recent || [])
    .filter((a: any) => a.role !== "admin" && !a.is_team_member && !submittedIds.has(a.id))
    .map((a: any) => ({ accountId: a.id, email: a.email, accountCreatedAt: a.created_at, state: "awaiting_form" as const }))

  return NextResponse.json({ items: [...submitted, ...awaiting], attention: submitted.filter((s: any) => s.state === "awaiting_access" || s.state === "submitted").length })
}
