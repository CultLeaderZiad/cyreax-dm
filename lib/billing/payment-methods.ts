/**
 * Where customers send money for a plan. Server-side config only: the page
 * reads these through the checkout server component, never from client env.
 *
 * Defaults are the documented production numbers; override per environment
 * with PAYMENT_WALLET_NUMBER and PAYMENT_INSTAPAY_NUMBER (local 11-digit form).
 */
export type ManualPaymentMethod = "wallet" | "instapay"

export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = ["wallet", "instapay"]

const DEFAULT_WALLET_NUMBER = "01007019031"
const DEFAULT_INSTAPAY_NUMBER = "01069647929"

type Env = Record<string, string | undefined>

/** Egyptian mobile number, local form 01XXXXXXXXX. */
export function isEgyptianMobile(value: string): boolean {
  return /^01[0125]\d{8}$/.test(value)
}

export function toInternational(local: string): string {
  return `+20${local.replace(/^0/, "")}`
}

function configuredNumber(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "").replace(/[\s-]/g, "")
  if (!cleaned) return fallback
  const local = cleaned.startsWith("+20") ? `0${cleaned.slice(3)}` : cleaned
  return isEgyptianMobile(local) ? local : fallback
}

export interface PaymentDestination {
  method: ManualPaymentMethod
  local: string
  international: string
}

export function paymentDestinations(env: Env = process.env): Record<ManualPaymentMethod, PaymentDestination> {
  const wallet = configuredNumber(env.PAYMENT_WALLET_NUMBER, DEFAULT_WALLET_NUMBER)
  const instapay = configuredNumber(env.PAYMENT_INSTAPAY_NUMBER, DEFAULT_INSTAPAY_NUMBER)
  return {
    wallet: { method: "wallet", local: wallet, international: toInternational(wallet) },
    instapay: { method: "instapay", local: instapay, international: toInternational(instapay) },
  }
}

export function isManualPaymentMethod(value: unknown): value is ManualPaymentMethod {
  return value === "wallet" || value === "instapay"
}
