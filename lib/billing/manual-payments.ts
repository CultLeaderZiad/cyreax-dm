import { createHmac, randomInt, timingSafeEqual } from "crypto"
import { PLAN_CATALOG } from "@/lib/billing/plans"
import { isEgyptianMobile, isManualPaymentMethod, type ManualPaymentMethod } from "@/lib/billing/payment-methods"

/**
 * Pure rules for wallet / InstaPay plan payments. No I/O here so tests can
 * cover them directly; routes and the review SQL function do the writing.
 */

export const PROOF_MAX_BYTES = 5 * 1024 * 1024
export const PROOF_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const
export type ProofExt = keyof typeof PROOF_TYPES

export const SUBMISSIONS_PER_HOUR = 5
export const MAX_PENDING_PER_ACCOUNT = 3
export const QUOTE_TTL_MS = 48 * 60 * 60 * 1000

export type PaymentInterval = "month" | "year" | "lifetime"

export interface PlanRow {
  id: string
  name: string
  price_usd: number | string | null
  price_yearly?: number | string | null
  price_egp?: number | string | null
  price_yearly_egp?: number | string | null
  catalog_plan_id?: string | null
  billing_cycle?: string | null
  is_active?: boolean | null
  is_contact_sales?: boolean | null
}

export interface CheckoutTerms {
  interval: PaymentInterval
  /** Whole EGP. Null when no EGP price (or conversion rate) is configured. */
  amountEgp: number | null
  catalogPlanId: string
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Which entitlement plan a display plan grants. Falls back to the previous mapping. */
export function catalogPlanFor(plan: PlanRow): string {
  const explicit = String(plan.catalog_plan_id || "").trim()
  if (explicit && PLAN_CATALOG.some((entry) => entry.id === explicit && entry.monthlyUsd > 0)) return explicit
  return plan.billing_cycle === "monthly" ? "creator" : "creator_plus"
}

/**
 * The amount the customer must transfer, decided on the server.
 * EGP columns win; otherwise USD x PAYMENT_EGP_PER_USD (rounded up). With
 * neither, checkout is blocked rather than guessing a price.
 */
export function checkoutTerms(plan: PlanRow, cycle: string | null | undefined, env: Record<string, string | undefined> = process.env): CheckoutTerms {
  const billing = plan.billing_cycle || "monthly"
  const interval: PaymentInterval =
    billing === "lifetime" ? "lifetime" : billing === "yearly" || (billing === "monthly" && cycle === "yearly") ? "year" : "month"
  const wantsYearlyPrice = billing === "monthly" && interval === "year"
  const egp = wantsYearlyPrice ? num(plan.price_yearly_egp) : num(plan.price_egp)
  let amountEgp = egp ? Math.round(egp) : null
  if (amountEgp === null) {
    const rate = num(env.PAYMENT_EGP_PER_USD)
    const usd = wantsYearlyPrice ? num(plan.price_yearly) : num(plan.price_usd)
    if (rate && usd) amountEgp = Math.ceil(usd * rate)
  }
  return { interval, amountEgp, catalogPlanId: catalogPlanFor(plan) }
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Short code the customer writes in the transfer note, e.g. CX-7KQ4MZ. */
export function newReferenceCode(): string {
  let out = ""
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)]
  return `CX-${out}`
}

export interface PaymentQuote {
  v: 1
  account: string
  plan: string
  catalog: string
  interval: PaymentInterval
  amountEgp: number
  ref: string
  exp: number
}

function quoteKey(secret: string | undefined): Buffer {
  if (!secret || secret.length < 16) throw new Error("BYOK_ENCRYPTION_SECRET is required to sign payment quotes")
  return createHmac("sha256", secret).update("cyreax:payment-quote:v1").digest()
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url")

/**
 * The checkout page signs what it showed (account, plan, amount, reference).
 * The submit route accepts only a valid, unexpired quote for the same account,
 * so the amount and plan can't be edited in the browser.
 */
export function signQuote(quote: PaymentQuote, secret: string | undefined = process.env.BYOK_ENCRYPTION_SECRET): string {
  const body = b64(JSON.stringify(quote))
  const mac = createHmac("sha256", quoteKey(secret)).update(body).digest("base64url")
  return `${body}.${mac}`
}

export function verifyQuote(
  token: string | null | undefined,
  accountId: string,
  nowMs: number = Date.now(),
  secret: string | undefined = process.env.BYOK_ENCRYPTION_SECRET,
): PaymentQuote | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null
  const [body, mac] = token.split(".", 2)
  const expected = createHmac("sha256", quoteKey(secret)).update(body).digest()
  let given: Buffer
  try {
    given = Buffer.from(mac, "base64url")
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let quote: PaymentQuote
  try {
    quote = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (quote?.v !== 1 || quote.account !== accountId || !(quote.exp > nowMs)) return null
  if (!/^CX-[A-Z2-9]{6}$/.test(quote.ref) || !(quote.amountEgp > 0)) return null
  return quote
}

export function normalizeTransactionRef(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase()
}

export interface SubmissionInput {
  method: ManualPaymentMethod
  senderRef: string
  amountPaidEgp: number
  transactionRef: string
  transferredAt: string
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string; field: string }

/** Server-side validation of the proof form. Messages are shown to the customer. */
export function validateSubmission(raw: Record<string, unknown>, nowMs: number = Date.now()): Validation<SubmissionInput> {
  const method = raw.method
  if (!isManualPaymentMethod(method)) return { ok: false, field: "method", error: "Choose e-wallet or InstaPay." }

  const sender = String(raw.senderRef ?? "").trim().replace(/[\s-]/g, "")
  const senderLocal = sender.startsWith("+20") ? `0${sender.slice(3)}` : sender
  const senderOk =
    method === "wallet"
      ? isEgyptianMobile(senderLocal)
      : isEgyptianMobile(senderLocal) || /^[a-z0-9._-]{3,40}@instapay$/i.test(sender)
  if (!senderOk) {
    return {
      ok: false,
      field: "senderRef",
      error: method === "wallet" ? "Enter the wallet number you sent from (01XXXXXXXXX)." : "Enter the mobile number or InstaPay address (name@instapay) you sent from.",
    }
  }

  const amount = Number(String(raw.amountPaid ?? "").replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return { ok: false, field: "amountPaid", error: "Enter the amount you transferred in EGP." }
  }

  const transactionRef = normalizeTransactionRef(raw.transactionRef)
  if (!/^[A-Z0-9][A-Z0-9_./-]{3,63}$/.test(transactionRef)) {
    return { ok: false, field: "transactionRef", error: "Enter the transaction number from the SMS or app receipt." }
  }

  const transferred = Date.parse(String(raw.transferredAt ?? ""))
  if (!Number.isFinite(transferred) || transferred > nowMs + 10 * 60_000 || transferred < nowMs - 30 * 86_400_000) {
    return { ok: false, field: "transferredAt", error: "Enter when you made the transfer (within the last 30 days)." }
  }

  return {
    ok: true,
    value: {
      method,
      senderRef: method === "wallet" || isEgyptianMobile(senderLocal) ? senderLocal : sender.toLowerCase(),
      amountPaidEgp: Math.round(amount * 100) / 100,
      transactionRef,
      transferredAt: new Date(transferred).toISOString(),
    },
  }
}

/** Real image type from the first bytes, not the filename or the browser's claim. */
export function detectImageType(bytes: Uint8Array): ProofExt | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg"
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return "webp"
  }
  return null
}

export function validateProofFile(file: { size: number; type?: string } | null, bytes: Uint8Array | null): Validation<ProofExt> {
  if (!file || !bytes || bytes.length === 0) return { ok: false, field: "proof", error: "Attach a screenshot of the transfer." }
  if (file.size > PROOF_MAX_BYTES || bytes.length > PROOF_MAX_BYTES) {
    return { ok: false, field: "proof", error: "The screenshot must be 5 MB or smaller." }
  }
  const ext = detectImageType(bytes)
  if (!ext) return { ok: false, field: "proof", error: "Upload a PNG, JPG or WebP image." }
  return { ok: true, value: ext }
}

export function proofObjectPath(accountId: string, paymentId: string, ext: ProofExt): string {
  return `${accountId}/${paymentId}.${ext}`
}

export type CustomerPaymentStatus = "under_review" | "approved" | "rejected"

/** What the customer sees. Only the DB status decides it. */
export function customerStatus(row: { status?: string | null }): CustomerPaymentStatus {
  if (row.status === "approved") return "approved"
  if (row.status === "rejected") return "rejected"
  return "under_review"
}
