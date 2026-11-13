import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const { classify, clientIp, checkRequest, MemoryLimiter, takeDbSlot, TIERS } = await import("../lib/security/http-limits.ts")

const h = (init: Record<string, string> = {}) => new Headers({ "x-forwarded-for": "203.0.113.7", ...init })

function routes(dir = "app/api"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return routes(p)
    return name === "route.ts" ? ["/" + dir.replace(/^app\//, "").replace(/\[([^\]]+)\]/g, "x")] : []
  })
}

describe("every API route has a limit", () => {
  it("classifies all routes, and each tier has a finite limit and body cap", () => {
    const all = routes()
    assert.ok(all.length > 100, `found ${all.length} routes`)
    for (const r of all) {
      for (const m of ["GET", "POST"]) {
        const rule = classify(r, m)
        assert.ok(rule.limit > 0 && rule.limit <= 1200, `${m} ${r} limit ${rule.limit}`)
        assert.ok(rule.maxBodyBytes > 0 && rule.maxBodyBytes <= 6 * 1024 * 1024, `${m} ${r} body cap`)
      }
    }
  })

  it("the proxy applies the limiter to every /api path", () => {
    const src = readFileSync("proxy.ts", "utf8")
    assert.match(src, /export async function proxy\(/)
    assert.ok(src.includes('pathname.startsWith("/api/")'))
    assert.ok(src.indexOf("checkRequest(") < src.indexOf("auth.getUser()"), "limits run before the session lookup")
    // Matcher must not exclude /api.
    const matcher = src.slice(src.indexOf("matcher"))
    assert.ok(!/\(\?!.*api/.test(matcher), "matcher excludes /api")
  })

  it("sensitive routes get the strict tiers", () => {
    assert.equal(classify("/api/auth/callback", "GET").tier, "auth")
    assert.equal(classify("/api/instagram/auth", "GET").tier, "auth")
    assert.equal(classify("/api/team/accept", "POST").tier, "auth")
    assert.equal(classify("/api/newsletter/subscribe", "POST").tier, "auth")
    assert.equal(classify("/api/auth/me", "GET").tier, "read")
    assert.equal(classify("/api/ai/copy-suggestion", "POST").tier, "ai")
    assert.equal(classify("/api/groq/auto-reply", "POST").tier, "ai")
    assert.equal(classify("/api/flows/abc/test", "POST").tier, "ai")
    assert.equal(classify("/api/webchat/message", "POST").tier, "ai")
    assert.equal(classify("/api/payments/manual", "POST").tier, "upload")
    assert.equal(classify("/api/payments/manual", "GET").tier, "read")
    assert.equal(classify("/api/instagram/webhook", "POST").tier, "webhook")
    assert.equal(classify("/api/telegram/webhook/abc", "POST").tier, "webhook")
    assert.equal(classify("/api/cron/dunning", "GET").tier, "cron")
    assert.equal(classify("/api/plans", "GET").tier, "public")
    assert.equal(classify("/api/contacts", "POST").tier, "write")
    assert.equal(classify("/api/contacts", "GET").tier, "read")
  })
})

describe("limiter behaviour", () => {
  const allow = async () => "allowed" as const

  it("refuses oversized bodies before counting", async () => {
    const memory = new MemoryLimiter()
    const d = await checkRequest({ pathname: "/api/contacts", method: "POST", headers: h({ "content-length": String(2 * 1024 * 1024) }) }, { memory, db: allow })
    assert.equal(d.status, 413)
    assert.equal(memory.size, 0)
  })

  it("allows uploads up to their own cap", async () => {
    const d = await checkRequest({ pathname: "/api/payments/manual", method: "POST", headers: h({ "content-length": String(5 * 1024 * 1024) }) }, { memory: new MemoryLimiter(), db: allow })
    assert.equal(d.allowed, true)
  })

  it("blocks after the limit in memory, without asking the database", async () => {
    const memory = new MemoryLimiter()
    let dbCalls = 0
    const db = async () => { dbCalls++; return "allowed" as const }
    const limit = TIERS.auth.limit
    for (let i = 0; i < limit; i++) {
      const d = await checkRequest({ pathname: "/api/auth/callback", method: "GET", headers: h() }, { memory, db })
      assert.equal(d.allowed, true)
    }
    const blocked = await checkRequest({ pathname: "/api/auth/callback", method: "GET", headers: h() }, { memory, db })
    assert.equal(blocked.status, 429)
    assert.ok(blocked.retryAfter && blocked.retryAfter > 0)
    assert.equal(dbCalls, limit)
  })

  it("the shared database counter blocks even when this instance has seen little", async () => {
    const d = await checkRequest({ pathname: "/api/contacts", method: "POST", headers: h() }, { memory: new MemoryLimiter(), db: async () => "limited" })
    assert.equal(d.status, 429)
  })

  it("separate IPs have separate buckets", async () => {
    const memory = new MemoryLimiter()
    for (let i = 0; i < TIERS.auth.limit; i++) await checkRequest({ pathname: "/api/auth/callback", method: "GET", headers: h() }, { memory, db: allow })
    const other = await checkRequest({ pathname: "/api/auth/callback", method: "GET", headers: h({ "x-forwarded-for": "198.51.100.1" }) }, { memory, db: allow })
    assert.equal(other.allowed, true)
  })

  it("database errors: strict tiers fail closed, others fall back to memory", async () => {
    const err = async () => "error" as const
    const auth = await checkRequest({ pathname: "/api/auth/callback", method: "GET", headers: h() }, { memory: new MemoryLimiter(), db: err })
    assert.equal(auth.status, 503)
    const write = await checkRequest({ pathname: "/api/contacts", method: "POST", headers: h() }, { memory: new MemoryLimiter(), db: err })
    assert.equal(write.allowed, true)
  })

  it("busy readers are checked against the shared counter; light ones are not", async () => {
    const memory = new MemoryLimiter()
    let dbCalls = 0
    const db = async () => { dbCalls++; return "allowed" as const }
    for (let i = 0; i < TIERS.read.dbAfter; i++) await checkRequest({ pathname: "/api/contacts", method: "GET", headers: h() }, { memory, db })
    assert.equal(dbCalls, 0)
    await checkRequest({ pathname: "/api/contacts", method: "GET", headers: h() }, { memory, db })
    assert.equal(dbCalls, 1)
  })

  it("memory stays bounded under an IP spray", () => {
    const memory = new MemoryLimiter(100)
    for (let i = 0; i < 1000; i++) memory.take(`k${i}`, 5, 60)
    assert.ok(memory.size <= 100)
  })

  it("client IP is the first forwarded hop", () => {
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4")
    assert.equal(clientIp(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8")
    assert.equal(clientIp(new Headers()), "unknown")
  })

  it("takeDbSlot maps the RPC answer and fails safe", async () => {
    const env = { url: "http://db", serviceKey: "k" }
    const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    assert.equal(await takeDbSlot("k", 1, 60, env, respond(true)), "allowed")
    assert.equal(await takeDbSlot("k", 1, 60, env, respond(false)), "limited")
    assert.equal(await takeDbSlot("k", 1, 60, env, respond({ message: "x" }, 500)), "error")
    assert.equal(await takeDbSlot("k", 1, 60, {}, respond(true)), "error")
  })
})
