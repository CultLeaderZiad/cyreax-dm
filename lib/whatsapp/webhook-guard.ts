type WebhookGuardEnv = {
  NODE_ENV?: string
  VERCEL_ENV?: string
  DISABLE_WEBHOOK_SIGNATURE_CHECK?: string
}

/**
 * True only outside production when the explicit dev bypass flag is set.
 * NODE_ENV or VERCEL_ENV of "production" always fails closed.
 */
export function devWebhookSignatureBypass(env: WebhookGuardEnv = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false
  return env.DISABLE_WEBHOOK_SIGNATURE_CHECK === "true"
}

/** Exact, case-sensitive match against WHATSAPP_WEBHOOK_VERIFY_TOKEN only. */
export function whatsappVerifyTokenMatches(candidate: string | null, expected: string | undefined): boolean {
  if (!candidate || !expected) return false
  return candidate === expected
}
