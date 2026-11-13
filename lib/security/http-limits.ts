/**
 * Central request limits for every /api route, enforced in proxy.ts before
 * any route code runs (so no route can forget them).
 *
 * Two layers:
 *  1. In-memory fixed window per server instance: free, stops floods before
 *     they cost a database round trip.
 *  2. Postgres fixed window (take_inbound_rate_slot) shared by every
 *     instance: the reliable limit, since serverless instances come and go.
 *
 * Route-specific limits (per account for AI, per visitor for webchat, per key
 * for API v1) still apply on top of these per-IP limits.
 */

export type Tier = "auth" | "ai" | "write" | "read" | "public" | "webhook" | "cron" | "upload"

export interface TierRule {
  tier: Tier
  /** Requests per window per client IP. */
  limit: number
  windowSeconds: number
  /** Largest request body accepted, in bytes. */
  maxBodyBytes: number
  /** On a database error: refuse (true) or fall back to the memory layer only (false). */
  failClosed: boolean
  /**
   * Requests from one IP this instance lets through before it starts asking
   * the shared database counter. 0 = every request is checked in the database.
   * High-volume, cheap tiers (dashboard reads, signed webhooks) skip the round
   * trip for normal traffic and only pay it once a client is busy.
   */
  dbAfter: number
}

const KB = 1024
const MB = 1024 * KB

export const TIERS: Record<Tier, Omit<TierRule, "tier">> = {
  // Login, OAuth starts/callbacks, invites, sign-ups: brute force and enumeration targets.
  auth: { dbAfter: 0, limit: 20, windowSeconds: 60, maxBodyBytes: 64 * KB, failClosed: true },
  // Paid model calls.
  ai: { dbAfter: 0, limit: 30, windowSeconds: 60, maxBodyBytes: 256 * KB, failClosed: true },
  // Authenticated mutations.
  write: { dbAfter: 0, limit: 90, windowSeconds: 60, maxBodyBytes: 1 * MB, failClosed: false },
  // Authenticated reads (dashboards poll; SWR refreshes several endpoints at once).
  read: { dbAfter: 100, limit: 400, windowSeconds: 60, maxBodyBytes: 64 * KB, failClosed: false },
  // Unauthenticated reads: plans, bio pages, shared reports, widget config, health.
  public: { dbAfter: 0, limit: 120, windowSeconds: 60, maxBodyBytes: 64 * KB, failClosed: false },
  // Signed provider callbacks. Meta/Telegram send from shared IPs in bursts, so
  // the cap is high; the signature check rejects forgeries cheaply.
  webhook: { dbAfter: 300, limit: 1200, windowSeconds: 60, maxBodyBytes: 1 * MB, failClosed: false },
  // Secret-protected; only the scheduler should call these.
  cron: { dbAfter: 0, limit: 30, windowSeconds: 60, maxBodyBytes: 16 * KB, failClosed: false },
  // Payment proof screenshots and knowledge files.
  upload: { dbAfter: 0, limit: 10, windowSeconds: 60, maxBodyBytes: 6 * MB, failClosed: true },
}

const has = (path: string, re: RegExp) => re.test(path)

/** Picks the tier for an /api path. Order matters: most specific first. */
export function classify(pathname: string, method: string): TierRule {
  const p = pathname.replace(/\/+$/, "") || "/"
  const m = method.toUpperCase()
  const read = m === "GET" || m === "HEAD" || m === "OPTIONS"
  const rule = (tier: Tier): TierRule => ({ tier, ...TIERS[tier] })

  if (has(p, /^\/api\/cron\//)) return rule("cron")
  if (has(p, /^\/api\/(instagram|facebook|whatsapp|tiktok)\/webhook$/) || has(p, /^\/api\/telegram\/webhook\//)) return rule("webhook")
  if (has(p, /^\/api\/payments\/(paymob|tap|stripe)$/) || has(p, /^\/api\/meta\/(deauthorize|data-deletion)$/)) return rule("webhook")
  if (!read && has(p, /^\/api\/(payments\/manual|ai-agent\/knowledge)$/)) return rule("upload")
  if (
    has(p, /^\/api\/auth\//) ||
    has(p, /^\/api\/(instagram|facebook|tiktok)\/(auth|callback|test-login)$/) ||
    has(p, /^\/api\/team\/accept$/) ||
    has(p, /^\/api\/newsletter\/subscribe$/) ||
    has(p, /^\/api\/data-deletion\/status$/) ||
    has(p, /^\/api\/payments\/submit$/) ||
    has(p, /^\/api\/webchat\/session$/)
  ) {
    // /api/auth/me is polled by every page; it is a read, not a login attempt.
    if (p === "/api/auth/me") return rule("read")
    return rule("auth")
  }
  if (
    has(p, /^\/api\/(ai|groq)\//) ||
    has(p, /^\/api\/ai-agent\/(playground|import-url)$/) ||
    has(p, /^\/api\/flows\/[^/]+\/test$/) ||
    (!read && has(p, /^\/api\/webchat\/message$/))
  ) return rule("ai")
  if (
    has(p, /^\/api\/(health|plans|catalog)$/) ||
    has(p, /^\/api\/public\//) ||
    has(p, /^\/api\/share\//) ||
    has(p, /^\/api\/webchat\//) ||
    has(p, /^\/api\/v1\//)
  ) return read ? rule("public") : rule("write")
  return read ? rule("read") : rule("write")
}

/**
 * Client IP for keying. On Vercel, x-forwarded-for is set by the edge and its
 * first entry is the real client; x-real-ip is the fallback. Unknown clients
 * share one bucket, which fails safe (they throttle each other, not us).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown"
  return ip.slice(0, 64)
}

export function bucketKey(rule: TierRule, ip: string): string {
  return `abuse:http:${rule.tier}:ip:${ip}`
}

/** Per-instance fixed window. Bounded in size so a spray of IPs can't grow it forever. */
export class MemoryLimiter {
  private buckets = new Map<string, { start: number; count: number }>()
  private maxKeys: number
  constructor(maxKeys = 20_000) {
    this.maxKeys = maxKeys
  }

  /** Counts the request. Returns its position in the window (1, 2, ...), or 0 when over the limit. */
  take(key: string, limit: number, windowSeconds: number, now = Date.now()): number {
    const windowMs = windowSeconds * 1000
    let b = this.buckets.get(key)
    if (!b || now - b.start >= windowMs) {
      if (!b && this.buckets.size >= this.maxKeys) this.evict(now, windowMs)
      b = { start: now, count: 0 }
      this.buckets.set(key, b)
    }
    if (b.count >= limit) return 0
    b.count++
    return b.count
  }

  private evict(now: number, windowMs: number) {
    for (const [k, v] of this.buckets) if (now - v.start >= windowMs) this.buckets.delete(k)
    // Still full: drop the oldest entries (Map keeps insertion order).
    while (this.buckets.size >= this.maxKeys) {
      const first = this.buckets.keys().next().value
      if (first === undefined) break
      this.buckets.delete(first)
    }
  }

  get size() {
    return this.buckets.size
  }
}

export type DbVerdict = "allowed" | "limited" | "error"

/** Shared limit via PostgREST, using the service role (server-side only). */
export async function takeDbSlot(
  key: string,
  limit: number,
  windowSeconds: number,
  env: { url?: string; serviceKey?: string } = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DbVerdict> {
  if (!env.url || !env.serviceKey) return "error"
  try {
    const res = await fetchImpl(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/take_inbound_rate_slot`, {
      method: "POST",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_account_key: key.slice(0, 200), p_limit: limit, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return "error"
    const ok = await res.json()
    return ok === true ? "allowed" : ok === false ? "limited" : "error"
  } catch {
    return "error"
  }
}

export interface LimitDecision {
  allowed: boolean
  status?: 413 | 429 | 503
  rule: TierRule
  retryAfter?: number
}

/** The whole check, minus the HTTP response, so it can be unit-tested. */
export async function checkRequest(
  input: { pathname: string; method: string; headers: Headers },
  deps: { memory: MemoryLimiter; db: (key: string, limit: number, windowSeconds: number) => Promise<DbVerdict> },
): Promise<LimitDecision> {
  const rule = classify(input.pathname, input.method)
  // Cheapest check first: refuse oversized bodies before any work.
  const declared = Number(input.headers.get("content-length") || 0)
  if (declared > rule.maxBodyBytes) return { allowed: false, status: 413, rule }

  const key = bucketKey(rule, clientIp(input.headers))
  const seen = deps.memory.take(key, rule.limit, rule.windowSeconds)
  if (seen === 0) {
    return { allowed: false, status: 429, rule, retryAfter: rule.windowSeconds }
  }
  if (seen <= rule.dbAfter) return { allowed: true, rule }
  const verdict = await deps.db(key, rule.limit, rule.windowSeconds)
  if (verdict === "limited") return { allowed: false, status: 429, rule, retryAfter: rule.windowSeconds }
  if (verdict === "error" && rule.failClosed) return { allowed: false, status: 503, rule, retryAfter: 30 }
  return { allowed: true, rule }
}
