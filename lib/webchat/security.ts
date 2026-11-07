import crypto from "crypto"
import { takeRateToken, type RateBucket } from "@/lib/event-pipeline"

export const WEBCHAT_RATE_LIMIT = 20
export const WEBCHAT_RATE_WINDOW_MS = 60_000

export function newWidgetKey(): string {
  return `wk_${crypto.randomBytes(18).toString("hex")}`
}

export function newVisitorCredentials(): { visitorId: string; secret: string; secretHash: string } {
  const visitorId = crypto.randomBytes(16).toString("hex")
  const secret = crypto.randomBytes(24).toString("hex")
  return { visitorId, secret, secretHash: hashVisitorSecret(secret) }
}

export function hashVisitorSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex")
}

export function visitorSecretMatches(secret: string, secretHash: string): boolean {
  if (!secret || !secretHash) return false
  const actual = hashVisitorSecret(secret)
  if (actual.length !== secretHash.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(secretHash, "utf8"))
}

/**
 * Host match against the workspace allow-list.
 * An empty list allows nothing. `*.example.com` matches that host and its subdomains.
 * The scheme is ignored; only the host is compared.
 */
export function originAllowed(origin: string | null | undefined, allowed: string[] | null | undefined): boolean {
  if (!origin) return false
  let host = ""
  try {
    host = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  if (!host) return false
  for (const raw of allowed || []) {
    const rule = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
    if (!rule) continue
    if (rule.startsWith("*.")) {
      const bare = rule.slice(2)
      if (host === bare || host.endsWith(`.${bare}`)) return true
      continue
    }
    if (host === rule) return true
  }
  return false
}

export function webchatCorsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  if (!origin || !allowed) return { Vary: "Origin" }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}

export function consumeWebchatRate(
  bucket: RateBucket | null,
  now: number,
  limit = WEBCHAT_RATE_LIMIT,
  windowMs = WEBCHAT_RATE_WINDOW_MS,
) {
  return takeRateToken(bucket, now, limit, windowMs)
}

export function widgetSnippet(origin: string, publicKey: string): string {
  const base = origin.replace(/\/$/, "")
  return `<script src="${base}/widget.js" data-cyreax-key="${publicKey}" async></script>`
}

export function clientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for")
  if (vercel) return vercel.split(",")[0]?.trim() || "unknown"
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"
  return headers.get("x-real-ip") || "unknown"
}
