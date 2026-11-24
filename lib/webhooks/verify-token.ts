import { timingSafeEqual } from "crypto"

type VerifyEnv = Record<string, string | undefined>

export type MetaProduct = "instagram" | "facebook" | "whatsapp"

/** The only env var each product's GET handshake accepts. */
export const VERIFY_TOKEN_ENV: Record<MetaProduct, string> = {
  instagram: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  facebook: "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  whatsapp: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
}

/**
 * Meta `hub.verify_token` handshake for one product. Accepts only that
 * product's token (WhatsApp only WHATSAPP_WEBHOOK_VERIFY_TOKEN, and so on),
 * so a token leaked or set up for one product cannot subscribe another.
 * Compared exactly (case-sensitive, constant time). No fallback or shared
 * token: an unset product token means the handshake fails.
 *
 * This is only the subscription handshake. POST deliveries still require a
 * valid X-Hub-Signature-256 HMAC in each route.
 */
export function metaVerifyTokenMatches(
  product: MetaProduct,
  candidate: string | null | undefined,
  env: VerifyEnv = process.env,
): boolean {
  if (!candidate) return false
  const expected = env[VERIFY_TOKEN_ENV[product]]
  if (!expected) return false
  const given = Buffer.from(candidate, "utf8")
  const want = Buffer.from(expected, "utf8")
  if (want.length !== given.length) {
    // Still do a constant-time compare so timing does not reveal the length check.
    timingSafeEqual(want, want)
    return false
  }
  return timingSafeEqual(want, given)
}
