export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { maskToken, parseOnboarding } from "@/lib/onboarding"
import { openAccessToken, sealAccessToken } from "@/lib/token-crypto"
import { notifyAdminOfOnboarding } from "@/lib/onboarding-notify"

/** The signed-in customer's onboarding form: read it, submit it, correct it until the admin has connected them. */
export async function GET(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const supabase = await getSupabaseBypassClient()
  const { data } = await supabase.from("account_onboarding").select("*").eq("account_id", session.user.id).maybeSingle()
  if (!data) return NextResponse.json({ submitted: false })
  let token: string | null = null
  try { token = data.telegram_bot_token ? openAccessToken(data.telegram_bot_token) : null } catch { token = null }
  return NextResponse.json({
    submitted: true,
    status: data.status,
    message: data.admin_note || null,
    values: {
      fullName: data.full_name,
      company: data.company || "",
      instagramUsername: data.instagram_username || "",
      facebookId: data.facebook_id || "",
      telegramBotToken: maskToken(token) || "",
    },
  })
}

export async function PUT(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  if (session.user.permission_level === "viewer") return NextResponse.json({ error: "Viewers cannot edit onboarding." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const supabase = await getSupabaseBypassClient()
  const existing = await supabase.from("account_onboarding").select("*").eq("account_id", session.user.id).maybeSingle()
  if (existing.data?.status === "connected") return NextResponse.json({ error: "Your accounts are already connected. Contact support to change them." }, { status: 409 })

  // A masked token echoed back by the form means "keep the one on file". It is
  // swapped for a well-formed placeholder only while validating the other fields.
  const raw = { ...(body || {}) } as Record<string, unknown>
  const echoedMask = typeof raw.telegramBotToken === "string" && raw.telegramBotToken.includes("•")
  const keepToken = echoedMask && Boolean(existing.data?.telegram_bot_token)
  if (echoedMask) raw.telegramBotToken = keepToken ? `123456789:${"a".repeat(35)}` : ""
  const parsed = parseOnboarding(raw)
  if (!parsed.ok) return NextResponse.json({ error: "Please fix the highlighted fields.", errors: parsed.errors }, { status: 400 })
  const clean = parsed.value
  const telegram_bot_token = keepToken ? existing.data.telegram_bot_token : clean.telegramBotToken ? sealAccessToken(clean.telegramBotToken) : null
  const now = new Date().toISOString()
  const row = {
    account_id: session.user.id,
    full_name: clean.fullName,
    company: clean.company,
    instagram_username: clean.instagramUsername,
    facebook_id: clean.facebookId,
    telegram_bot_token,
    status: "submitted" as const,
    updated_at: now,
    admin_seen_at: null,
    ...(existing.data ? {} : { submitted_at: now }),
  }
  const { error } = await supabase.from("account_onboarding").upsert(row, { onConflict: "account_id" })
  if (error) {
    console.error("[onboarding] save failed:", error.message)
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 })
  }
  if (!existing.data) void notifyAdminOfOnboarding({ name: clean.fullName, company: clean.company, email: session.user.email || null })
  return NextResponse.json({ ok: true })
}
