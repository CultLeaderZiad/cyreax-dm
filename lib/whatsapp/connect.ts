import { randomInt } from "node:crypto"
import { FACEBOOK_GRAPH_BASE } from "@/lib/graph"
import type { FetchLike } from "@/lib/channels/types"
import { defaultFetch, postJson } from "@/lib/channels/http"
import { openAccessToken, sealAccessToken } from "@/lib/token-crypto"
import { WHATSAPP_REGISTRATION_PIN_KEY } from "@/lib/whatsapp/embedded-signup"
import { BRAND } from "@/lib/brand"

const PHONE_NUMBER_FIELDS = "display_phone_number,verified_name,quality_rating,status,platform_type"

export interface WhatsAppNumber {
  phoneNumberId: string
  wabaId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  qualityRating: string | null
  status: string | null
  platformType: string | null
}

export interface PhoneRegistrationPlan {
  action: "skip" | "register"
  /** Plain 6-digit PIN to send, or the PIN already stored for a registered number. */
  pin: string | null
  reused: boolean
  /** Ciphertext to keep when we could not read a PIN and should not invent one. */
  preservedCipher: string | null
}

function appCredentials(): { appId: string; secret: string } | null {
  const appId =
    process.env.FACEBOOK_APP_ID ||
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
    process.env.INSTAGRAM_APP_ID ||
    process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ||
    ""
  const secret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || ""
  if (!appId || !secret) return null
  return { appId, secret }
}

export async function exchangeEmbeddedSignupCode(
  code: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const creds = appCredentials()
  if (!creds) return { ok: false, error: "Meta App credentials are missing." }

  const url = new URL(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set("client_id", creds.appId)
  url.searchParams.set("client_secret", creds.secret)
  url.searchParams.set("code", code)

  const response = await fetchImpl(url.toString())
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.access_token) {
    const detail = json?.error?.message || response.statusText || "unknown error"
    return { ok: false, error: `Facebook token exchange failed: ${detail}` }
  }
  return { ok: true, accessToken: String(json.access_token) }
}

export function wabaIdsFromDebugToken(json: any): string[] {
  const granular = json?.data?.granular_scopes
  if (!Array.isArray(granular)) return []
  const entry = granular.find((item: any) => item?.scope === "whatsapp_business_management")
  const targetIds = entry?.target_ids
  if (!Array.isArray(targetIds)) return []
  return targetIds.map((id: any) => String(id)).filter(Boolean)
}

export async function debugTokenWabaIds(
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<string[]> {
  const creds = appCredentials()
  if (!creds) return []
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/debug_token`)
  url.searchParams.set("input_token", accessToken)
  url.searchParams.set("access_token", `${creds.appId}|${creds.secret}`)
  const response = await fetchImpl(url.toString())
  const json = await response.json().catch(() => null)
  return wabaIdsFromDebugToken(json)
}

export async function fetchPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<WhatsAppNumber | null> {
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/${phoneNumberId}`)
  url.searchParams.set("fields", PHONE_NUMBER_FIELDS)
  const response = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.error || (!json?.id && !phoneNumberId)) return null
  return mapPhoneNumber(json, phoneNumberId, null)
}

export async function listWabaPhoneNumbers(
  wabaId: string,
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<WhatsAppNumber[]> {
  const url = new URL(`${FACEBOOK_GRAPH_BASE}/${wabaId}/phone_numbers`)
  url.searchParams.set("fields", `id,${PHONE_NUMBER_FIELDS}`)
  const response = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.error || !Array.isArray(json?.data)) return []
  return json.data
    .filter((row: any) => row?.id)
    .map((row: any) => mapPhoneNumber(row, String(row.id), wabaId))
}

/** Subscribe this app to the WABA so message webhooks are delivered. */
export async function subscribeWaba(
  wabaId: string,
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<boolean> {
  const result = await postJson(
    fetchImpl,
    `${FACEBOOK_GRAPH_BASE}/${wabaId}/subscribed_apps`,
    {},
    { Authorization: `Bearer ${accessToken}` },
  )
  return Boolean(result.ok && result.json?.success !== false && !result.json?.error)
}

/**
 * A number can send and receive on Cloud API only after registration.
 * Embedded Signup and WhatsApp Manager add the number, but they do not
 * register it. Skip the call when Meta already reports it registered so a
 * reconnect does not burn the 10-attempts-per-72-hours limit.
 */
export function isPhoneNumberRegistered(number: { status?: string | null; platformType?: string | null }): boolean {
  return String(number.platformType || "").trim().toUpperCase() === "CLOUD_API"
    && String(number.status || "").trim().toUpperCase() === "CONNECTED"
}

export function generateRegistrationPin(nextInt: (max: number) => number = (max) => randomInt(0, max)): string {
  return nextInt(1_000_000).toString().padStart(6, "0")
}

export function readRegistrationPin(stored: string | null | undefined): string | null {
  if (!stored) return null
  try {
    const plain = openAccessToken(stored)
    if (plain && /^\d{6}$/.test(plain)) return plain
  } catch {
    return null
  }
  return null
}

export function preparePhoneRegistration(
  number: { status?: string | null; platformType?: string | null },
  metadata: unknown,
  nextInt?: (max: number) => number,
): PhoneRegistrationPlan {
  const raw = rawRegistrationPin(metadata)
  const plain = readRegistrationPin(raw)
  const preservedCipher = plain ? null : raw
  if (isPhoneNumberRegistered(number)) {
    return { action: "skip", pin: plain, reused: Boolean(plain), preservedCipher }
  }
  if (plain) return { action: "register", pin: plain, reused: true, preservedCipher: null }
  return { action: "register", pin: generateRegistrationPin(nextInt), reused: false, preservedCipher }
}

/** Ciphertext to write. A freshly generated PIN is not stored when Meta says the number was already registered. */
export function registrationPinCipherToStore(
  plan: PhoneRegistrationPlan,
  outcome: "skipped" | "registered" | "already-registered",
): string | null {
  const keepPlain = plan.pin && (outcome === "registered" || outcome === "skipped" || (outcome === "already-registered" && plan.reused))
  if (keepPlain && plan.pin) return sealAccessToken(plan.pin)
  return plan.preservedCipher
}

export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<{ ok: true; alreadyRegistered?: boolean } | { ok: false; error: string; code?: number }> {
  const result = await postJson(
    fetchImpl,
    `${FACEBOOK_GRAPH_BASE}/${phoneNumberId}/register`,
    { messaging_product: "whatsapp", pin },
    { Authorization: `Bearer ${accessToken}` },
  )
  if (result.ok && result.json?.success !== false && !result.json?.error) return { ok: true }
  if (isAlreadyRegisteredResponse(result.json)) return { ok: true, alreadyRegistered: true }
  const code = typeof result.json?.error?.code === "number" ? result.json.error.code : undefined
  return { ok: false, error: registrationFailureMessage(result.json), code }
}

export async function deregisterPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await postJson(
    fetchImpl,
    `${FACEBOOK_GRAPH_BASE}/${phoneNumberId}/deregister`,
    {},
    { Authorization: `Bearer ${accessToken}` },
  )
  if (result.ok && result.json?.success !== false && !result.json?.error) return { ok: true }
  return { ok: false, error: graphErrorDetail(result.json, "WhatsApp did not deregister this number.") }
}

export async function unsubscribeWaba(
  wabaId: string,
  accessToken: string,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<boolean> {
  const response = await fetchImpl(`${FACEBOOK_GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = await response.json().catch(() => null)
  return Boolean(response.ok && json?.success !== false && !json?.error)
}

export function wabaIdFromConnection(row: {
  page_id?: string | null
  external_account_id?: string | null
  metadata?: { waba_id?: unknown } | null
}): string | null {
  const fromMetadata = row.metadata?.waba_id
  if (typeof fromMetadata === "string" && fromMetadata.trim()) return fromMetadata.trim()
  if (row.external_account_id && row.external_account_id !== row.page_id) return String(row.external_account_id)
  return null
}

export function shouldUnsubscribeWaba(otherWabaIds: Array<string | null | undefined>, wabaId: string | null): boolean {
  if (!wabaId) return false
  return !otherWabaIds.some((id) => id === wabaId)
}

/** Graph cleanup for disconnect. Failures are logged and never thrown. */
export async function releaseWhatsAppConnection(
  input: {
    accessToken: string
    phoneNumberId: string | null
    wabaId: string | null
    unsubscribe: boolean
  },
  fetchImpl: FetchLike = defaultFetch(),
): Promise<void> {
  if (input.unsubscribe && input.wabaId) {
    try {
      const ok = await unsubscribeWaba(input.wabaId, input.accessToken, fetchImpl)
      if (!ok) console.error("[whatsapp] unsubscribe failed for WABA", input.wabaId)
    } catch (error) {
      console.error("[whatsapp] unsubscribe failed:", error)
    }
  }
  if (input.phoneNumberId) {
    try {
      const result = await deregisterPhoneNumber(input.phoneNumberId, input.accessToken, fetchImpl)
      if (!result.ok) console.error("[whatsapp] deregister failed:", result.error)
    } catch (error) {
      console.error("[whatsapp] deregister failed:", error)
    }
  }
}

export function registrationFailureMessage(json: any): string {
  const code = typeof json?.error?.code === "number" ? json.error.code : undefined
  if (code === 133005) {
    return `This number already has a two-step verification PIN. Cloud API registration needs that existing 6-digit PIN, and ${BRAND.name} does not have it.`
  }
  if (code === 133015) {
    return "WhatsApp asked us to wait a few minutes before registering this number. Try connecting again shortly."
  }
  if (code === 133016) {
    return "WhatsApp blocked registration because this number was registered or deregistered too many times in the last 72 hours. Wait and try again."
  }
  const detail = graphErrorDetail(json, "WhatsApp rejected the registration request.")
  return `WhatsApp could not register this number for Cloud API (${code ?? "unknown"}): ${detail}`
}

export function isAlreadyRegisteredResponse(json: any): boolean {
  const message = `${json?.error?.message || ""} ${json?.error?.error_user_msg || ""}`
  return /already registered/i.test(message)
}

function graphErrorDetail(json: any, fallback: string): string {
  const detail = json?.error?.error_user_msg || json?.error?.message
  return typeof detail === "string" && detail.trim() ? detail.trim() : fallback
}

function rawRegistrationPin(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const value = (metadata as Record<string, unknown>)[WHATSAPP_REGISTRATION_PIN_KEY]
  return typeof value === "string" && value.trim() ? value : null
}

function mapPhoneNumber(row: any, fallbackId: string, wabaId: string | null): WhatsAppNumber {
  return {
    phoneNumberId: String(row?.id || fallbackId),
    wabaId,
    displayPhoneNumber: row?.display_phone_number ? String(row.display_phone_number) : null,
    verifiedName: row?.verified_name ? String(row.verified_name) : null,
    qualityRating: row?.quality_rating ? String(row.quality_rating) : null,
    status: row?.status ? String(row.status) : null,
    platformType: row?.platform_type ? String(row.platform_type) : null,
  }
}

/**
 * Rejects short-lived tokens pasted into the manual connect form. A
 * temporary token from the WhatsApp "API Setup" page dies in ~24h and every
 * reply after that silently fails; a System User token does not expire.
 * Returns null when the token is fine (or cannot be checked).
 */
export async function shortLivedTokenError(
  token: string,
  fetchImpl: FetchLike = defaultFetch(),
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const creds = appCredentials()
  if (!creds) return null
  try {
    const url = new URL(`${FACEBOOK_GRAPH_BASE}/debug_token`)
    url.searchParams.set("input_token", token)
    url.searchParams.set("access_token", `${creds.appId}|${creds.secret}`)
    const res = await fetchImpl(url.toString())
    const json: any = await res.json().catch(() => null)
    const data = json?.data
    if (!data) return null
    if (data.is_valid === false) return "That WhatsApp token is invalid or expired."
    const expires = Number(data.expires_at || 0)
    if (expires > 0 && expires - nowSec < 7 * 86_400) {
      return "That is a temporary token that expires soon. Create a permanent System User token in Meta Business Settings and paste that instead."
    }
    return null
  } catch {
    return null
  }
}
