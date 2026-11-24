import { createHmac, timingSafeEqual } from "crypto"

/**
 * Whop: card payments for every customer.
 *
 * Facts below are from Whop's docs (docs.whop.com, read 2026-11-23):
 * - API: https://api.whop.com/api/v1, `Authorization: Bearer <API key>` from the
 *   server only, pinned with the `Api-Version-Date` header.
 * - Checkout: POST /checkout_configurations { variant_id: "plan_…", metadata,
 *   redirect_url } returns { id: "ch_…", purchase_url }. Metadata is copied to
 *   the resulting payments and memberships.
 * - Webhooks follow Standard Webhooks: headers webhook-id, webhook-timestamp,
 *   webhook-signature ("v1,<base64>", space separated if several). The signed
 *   string is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 keyed with the literal
 *   bytes of the `ws_…` secret (the official SDK base64-encodes the whole secret
 *   only so the standardwebhooks library decodes it back to those bytes).
 *   Reject timestamps more than 5 minutes off. Deliveries are at least once and
 *   unordered: store webhook-id, and read current state from the API.
 * - Membership: status trialing | active | past_due | completed | canceled |
 *   expired | unresolved (active/trialing grant access), variant_id,
 *   current_period_end, expires_at, cancel_at_period_end, metadata.
 * - Buyers manage or cancel at https://whop.com/@me/settings/orders/
 */

export const WHOP_API_BASE = "https://api.whop.com/api/v1"
/** The API version our request and webhook shapes were written against. */
export const WHOP_API_VERSION_DATE = "2026-11-22"
/** Where a Whop buyer manages or cancels a subscription (Whop help center). */
export const WHOP_MANAGE_URL = "https://whop.com/@me/settings/orders/"
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

export function whopConfig(env: Env = process.env): { apiKey: string; webhookSecret: string; accountId: string | null } | null {
  const apiKey = env.WHOP_API_KEY?.trim()
  const webhookSecret = env.WHOP_WEBHOOK_SECRET?.trim()
  if (!apiKey || !webhookSecret) return null
  const accountId = env.WHOP_ACCOUNT_ID?.trim() || null
  return { apiKey, webhookSecret, accountId }
}

/** A Whop plan ("variant") id, as stored on our plans rows. */
export function isWhopVariantId(value: unknown): value is string {
  return typeof value === "string" && /^plan_[A-Za-z0-9]{4,64}$/.test(value)
}

/** Validation for the Admin -> Plans form: empty is fine, otherwise plan_… */
export function whopIdsError(body: Record<string, unknown>): string | null {
  for (const key of ["whop_variant_id", "whop_variant_id_yearly"]) {
    const value = body[key]
    if (value == null || value === "") continue
    if (!isWhopVariantId(value)) return `${key} must look like plan_XXXXXXXX (from Whop -> Products)`
  }
  return null
}

// ---------------------------------------------------------------- webhooks --

export class WhopSignatureError extends Error {}

/**
 * Verifies a Whop webhook and returns the parsed body. Throws
 * WhopSignatureError on a missing/invalid signature or a stale timestamp.
 * Pass the raw body string: re-serialised JSON will not match.
 */
export function verifyWhopWebhook(
  rawBody: string,
  headers: { get(name: string): string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { id: string; type: string; data: any; [key: string]: unknown } {
  if (!secret) throw new WhopSignatureError("missing secret")
  const id = headers.get("webhook-id")
  const timestamp = headers.get("webhook-timestamp")
  const signatureHeader = headers.get("webhook-signature")
  if (!id || !timestamp || !signatureHeader) throw new WhopSignatureError("missing signature headers")
  const ts = Number(timestamp)
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new WhopSignatureError("timestamp outside tolerance")
  }
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.${rawBody}`).digest()
  let ok = false
  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",", 2)
    if (version !== "v1" || !sig) continue
    let given: Buffer
    try {
      given = Buffer.from(sig, "base64")
    } catch {
      continue
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) ok = true
  }
  if (!ok) throw new WhopSignatureError("signature mismatch")
  let parsed: any
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    throw new WhopSignatureError("body is not JSON")
  }
  if (!parsed || typeof parsed.type !== "string") throw new WhopSignatureError("not a Whop event")
  return parsed
}

// --------------------------------------------------------------------- API --

async function whopRequest(
  path: string,
  init: { method?: string; body?: unknown },
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<any> {
  const res = await fetchImpl(`${WHOP_API_BASE}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Api-Version-Date": WHOP_API_VERSION_DATE,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    // Whop error bodies may echo request details; keep only a short message.
    const message = typeof json?.error?.message === "string" ? json.error.message.slice(0, 200) : `HTTP ${res.status}`
    throw new Error(`Whop API ${path.split("?")[0]}: ${message}`)
  }
  return json
}

export interface WhopCheckout {
  id: string
  purchaseUrl: string
}

export async function createWhopCheckout(
  input: { variantId: string; metadata: Record<string, string>; redirectUrl: string; accountId?: string | null },
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<WhopCheckout> {
  const json = await whopRequest(
    "/checkout_configurations",
    {
      method: "POST",
      body: {
        variant_id: input.variantId,
        metadata: input.metadata,
        redirect_url: input.redirectUrl,
        ...(input.accountId ? { account_id: input.accountId } : {}),
      },
    },
    apiKey,
    fetchImpl,
  )
  if (!json?.purchase_url || !json?.id) throw new Error("Whop API /checkout_configurations: no purchase_url")
  return { id: String(json.id), purchaseUrl: String(json.purchase_url) }
}

export interface WhopMembership {
  id: string
  status: string
  variant_id: string
  current_period_end: string | null
  expires_at: string | null
  cancel_at_period_end: boolean
  metadata: Record<string, unknown> | null
}

export async function getWhopMembership(id: string, apiKey: string, fetchImpl: FetchLike = fetch): Promise<WhopMembership> {
  if (!/^mem_[A-Za-z0-9]+$/.test(id)) throw new Error("invalid membership id")
  return whopRequest(`/memberships/${id}`, {}, apiKey, fetchImpl)
}

export async function getWhopPayment(id: string, apiKey: string, fetchImpl: FetchLike = fetch): Promise<any> {
  if (!/^pay_[A-Za-z0-9]+$/.test(id)) throw new Error("invalid payment id")
  return whopRequest(`/payments/${id}`, {}, apiKey, fetchImpl)
}

// ----------------------------------------------------------- billing state --

/** Membership statuses that grant access, per Whop's docs. */
const ACCESS_STATUSES = new Set(["active", "trialing"])

export interface BillingFromMembership {
  status: "active" | "trialing" | "past_due" | "canceled" | "expired"
  interval: "month" | "year" | "lifetime"
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/**
 * Maps a Whop membership to our billing_accounts fields. `interval` comes from
 * which of OUR plan columns the membership's variant matched, never from the
 * membership or metadata, so a buyer cannot unlock more than they bought.
 */
export function billingFromMembership(
  membership: Pick<WhopMembership, "status" | "current_period_end" | "expires_at" | "cancel_at_period_end">,
  interval: "month" | "year" | "lifetime",
): BillingFromMembership {
  const end = membership.current_period_end || membership.expires_at || null
  let status: BillingFromMembership["status"]
  if (ACCESS_STATUSES.has(membership.status)) status = membership.status === "trialing" ? "trialing" : "active"
  else if (membership.status === "past_due" || membership.status === "unresolved") status = "past_due"
  else if (membership.status === "canceled") status = "canceled"
  else status = "expired" // completed, expired, anything unknown: no access
  return {
    status,
    interval,
    // Lifetime has no end. A renewing plan with no end from Whop gets none
    // either; lib/billing/enforce.ts then treats it as not entitled.
    currentPeriodEnd: interval === "lifetime" ? null : end,
    cancelAtPeriodEnd: Boolean(membership.cancel_at_period_end),
  }
}

export interface PlanRow {
  id: string
  catalog_plan_id?: string | null
  billing_cycle?: string | null
  whop_variant_id?: string | null
  whop_variant_id_yearly?: string | null
}

/** Which of our plans (and interval) a Whop variant id is. */
export function planForVariant(plans: PlanRow[], variantId: string): { plan: PlanRow; interval: "month" | "year" | "lifetime" } | null {
  for (const plan of plans) {
    if (plan.whop_variant_id && plan.whop_variant_id === variantId) {
      return { plan, interval: plan.billing_cycle === "lifetime" ? "lifetime" : plan.billing_cycle === "yearly" ? "year" : "month" }
    }
    if (plan.whop_variant_id_yearly && plan.whop_variant_id_yearly === variantId) return { plan, interval: "year" }
  }
  return null
}

/** The Whop variant to sell for one of our plans and the requested cycle. */
export function variantForPlan(plan: PlanRow, cycle: "monthly" | "yearly" | undefined): { variantId: string; interval: "month" | "year" | "lifetime" } | null {
  if (cycle === "yearly" && plan.whop_variant_id_yearly && isWhopVariantId(plan.whop_variant_id_yearly)) {
    return { variantId: plan.whop_variant_id_yearly, interval: "year" }
  }
  if (plan.whop_variant_id && isWhopVariantId(plan.whop_variant_id)) {
    const interval = plan.billing_cycle === "lifetime" ? "lifetime" : plan.billing_cycle === "yearly" ? "year" : "month"
    return { variantId: plan.whop_variant_id, interval }
  }
  return null
}
