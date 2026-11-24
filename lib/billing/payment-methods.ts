/**
 * Where customers send money for a plan. Server-side config only: the page
 * reads these through the checkout server component, never from client env.
 *
 * Numbers come only from PAYMENT_WALLET_NUMBER and PAYMENT_INSTAPAY_NUMBER
 * (local 01XXXXXXXXX or +20 form). There is no built-in fallback: a missing or
 * invalid number hides that method ("temporarily unavailable"), so money is
 * never sent to a number nobody configured for this environment.
 */
export type ManualPaymentMethod = "wallet" | "instapay"

export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = ["wallet", "instapay"]

type Env = Record<string, string | undefined>

/** Egyptian mobile number, local form 01XXXXXXXXX. */
export function isEgyptianMobile(value: string): boolean {
  return /^01[0125]\d{8}$/.test(value)
}

export function toInternational(local: string): string {
  return `+20${local.replace(/^0/, "")}`
}

function configuredNumber(value: string | undefined): string | null {
  const cleaned = String(value || "").replace(/[\s-]/g, "")
  if (!cleaned) return null
  const local = cleaned.startsWith("+20") ? `0${cleaned.slice(3)}` : cleaned
  return isEgyptianMobile(local) ? local : null
}

export interface PaymentDestination {
  method: ManualPaymentMethod
  local: string
  international: string
}

/** null = not configured (or invalid): the method is hidden and refused. */
export function paymentDestinations(env: Env = process.env): Record<ManualPaymentMethod, PaymentDestination | null> {
  const wallet = configuredNumber(env.PAYMENT_WALLET_NUMBER)
  const instapay = configuredNumber(env.PAYMENT_INSTAPAY_NUMBER)
  return {
    wallet: wallet ? { method: "wallet", local: wallet, international: toInternational(wallet) } : null,
    instapay: instapay ? { method: "instapay", local: instapay, international: toInternational(instapay) } : null,
  }
}

export function availableMethods(env: Env = process.env): ManualPaymentMethod[] {
  const d = paymentDestinations(env)
  return MANUAL_PAYMENT_METHODS.filter((m) => d[m] !== null)
}

export function isManualPaymentMethod(value: unknown): value is ManualPaymentMethod {
  return value === "wallet" || value === "instapay"
}
