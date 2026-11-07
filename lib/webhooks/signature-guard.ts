export type WebhookGuardEnv = {
  NODE_ENV?: string
  VERCEL_ENV?: string
  DISABLE_WEBHOOK_SIGNATURE_CHECK?: string
}

/**
 * True only on a local machine when the explicit dev bypass flag is set.
 * Any Vercel deployment (production, preview or development) fails closed:
 * preview URLs are public, so an unsigned webhook there is still forgeable.
 */
export function devWebhookSignatureBypass(env: WebhookGuardEnv = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV) return false
  return env.DISABLE_WEBHOOK_SIGNATURE_CHECK === "true"
}

/** Exact, case-sensitive match against WHATSAPP_WEBHOOK_VERIFY_TOKEN only. */
export function whatsappVerifyTokenMatches(candidate: string | null, expected: string | undefined): boolean {
  if (!candidate || !expected) return false
  return candidate === expected
}
