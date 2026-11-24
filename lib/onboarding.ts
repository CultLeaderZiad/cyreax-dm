/**
 * Customer onboarding: the details the admin needs to connect a customer's
 * accounts by hand. Validation is strict and pure so it can be tested; nothing
 * here touches the database except `onboardingRequired`.
 */

import { isPlaceholderToken } from "@/lib/token-crypto"

export type OnboardingStatus = "submitted" | "approved" | "link_sent" | "connected"

export interface OnboardingInput {
  fullName: string
  company: string | null
  instagramUsername: string | null
  facebookId: string | null
  telegramBotToken: string | null
}

export type OnboardingErrors = Partial<Record<"fullName" | "company" | "instagramUsername" | "facebookId" | "telegramBotToken" | "channels", string>>

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "")

/** Cleans and checks what the form sent. Returns the clean values or per-field errors. */
export function parseOnboarding(raw: unknown): { ok: true; value: OnboardingInput } | { ok: false; errors: OnboardingErrors } {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const errors: OnboardingErrors = {}

  const fullName = text(body.fullName, 100)
  if (fullName.length < 2) errors.fullName = "Enter your name."

  const company = text(body.company, 100) || null

  const igRaw = text(body.instagramUsername, 60).replace(/^@+/, "")
  let instagramUsername: string | null = igRaw || null
  if (instagramUsername && !/^[A-Za-z0-9._]{1,30}$/.test(instagramUsername)) {
    errors.instagramUsername = "Use the username only, for example: mybrand (letters, numbers, dots, underscores)."
    instagramUsername = null
  }

  const fbRaw = text(body.facebookId, 40)
  let facebookId: string | null = fbRaw || null
  if (facebookId && !/^\d{5,20}$/.test(facebookId)) {
    errors.facebookId = "The Facebook Page ID is a number, for example 105298374612345."
    facebookId = null
  }

  const tgRaw = text(body.telegramBotToken, 120)
  let telegramBotToken: string | null = tgRaw || null
  if (telegramBotToken && !/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(telegramBotToken)) {
    errors.telegramBotToken = "That does not look like a bot token. It looks like 123456789:ABC... and comes from @BotFather."
    telegramBotToken = null
  }

  if (!igRaw && !fbRaw && !tgRaw) errors.channels = "Add at least one channel: an Instagram username, a Facebook Page ID or a Telegram bot token."

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { fullName, company, instagramUsername, facebookId, telegramBotToken } }
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  const head = token.split(":")[0] || ""
  return `${head}:••••••••`
}

/**
 * Does this customer still owe the form? Admins, invited team members, anyone
 * who already submitted it and accounts that already have a connected channel
 * (customers connected before this form existed) do not.
 */
export async function onboardingRequired(
  supabase: any,
  account: { id: string; role?: string | null; is_team_member?: boolean | null },
): Promise<boolean> {
  if (account.role === "admin" || account.is_team_member) return false
  const row = await supabase.from("account_onboarding").select("account_id").eq("account_id", account.id).maybeSingle()
  // Before the migration the table does not exist: never lock customers out because of that.
  if (row.error) return false
  if (row.data) return false
  const profiles = await supabase.from("users").select("id, access_token").eq("account_id", account.id)
  const hasToken = (profiles.data || []).some((p: any) => !isPlaceholderToken(p.access_token) && p.access_token !== "pending")
  if (hasToken) return false
  const conn = await supabase.from("platform_connections").select("id", { count: "exact", head: true }).eq("account_id", account.id)
  if ((conn.count ?? 0) > 0) return false
  return true
}
