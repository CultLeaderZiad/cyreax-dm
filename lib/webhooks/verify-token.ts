import { timingSafeEqual } from "crypto"

type VerifyEnv = Record<string, string | undefined>

const VERIFY_TOKEN_ENV = [
  "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_VERIFY_TOKEN",
  "META_WEBHOOK_VERIFY_TOKEN",
  "WEBHOOK_VERIFY_TOKEN",
] as const

/**
 * Meta `hub.verify_token` handshake. Only tokens configured in the
 * environment are accepted, compared exactly (case-sensitive, constant time).
 * There are no built-in fallback tokens: values committed to a public repo
 * are known to everyone. No configured token means the handshake fails.
 */
export function metaVerifyTokenMatches(candidate: string | null | undefined, env: VerifyEnv = process.env): boolean {
  if (!candidate) return false
  const given = Buffer.from(candidate, "utf8")
  let matched = false
  for (const name of VERIFY_TOKEN_ENV) {
    const expected = env[name]
    if (!expected) continue
    const want = Buffer.from(expected, "utf8")
    if (want.length === given.length && timingSafeEqual(want, given)) matched = true
  }
  return matched
}
