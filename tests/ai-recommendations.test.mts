import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { computeRecommendations, periodKey } = await import("../lib/ai/recommendations/signals.ts")
const { getRecommendations, InsightsDisabledError } = await import("../lib/ai/recommendations/service.ts")

const NOW = Date.parse("2026-11-24T12:00:00Z")
const h = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const base = { now: NOW, conversations: [], automations: [{ id: "a", name: "Promo", isActive: true, createdAt: iso(NOW - 40 * 24 * h), events14d: 5 }], sentiment: { positive: 0, neutral: 0, negative: 0 }, usage: [] }

describe("recommendation signals use only measured data", () => {
  it("a clean account gets no cards", () => {
    assert.deepEqual(computeRecommendations(base), [])
  })
  it("flags customers waiting over 24h, with the real count", () => {
    const cards = computeRecommendations({ ...base, conversations: [
      { lastMessageAt: iso(NOW - 30 * h), lastIsInbound: true },
      { lastMessageAt: iso(NOW - 2 * h), lastIsInbound: true },
      { lastMessageAt: iso(NOW - 50 * h), lastIsInbound: false },
    ] })
    assert.equal(cards.length, 1)
    assert.equal(cards[0].evidence.unanswered, 1)
  })
  it("flags no automation, idle automations, negative sentiment and near-limit usage", () => {
    assert.equal(computeRecommendations({ ...base, automations: [] })[0].key, "no_active_automation")
    const idle = computeRecommendations({ ...base, automations: [{ id: "a", name: "Old", isActive: true, createdAt: iso(NOW - 40 * 24 * h), events14d: 0 }] })
    assert.equal(idle[0].key, "idle_automations")
    const neg = computeRecommendations({ ...base, sentiment: { positive: 5, neutral: 2, negative: 5 } })
    assert.equal(neg[0].evidence.pct, 42)
    assert.equal(computeRecommendations({ ...base, sentiment: { positive: 1, neutral: 0, negative: 5 } }).length, 0) // too few comments to judge
    const usage = computeRecommendations({ ...base, usage: [{ metric: "contacts", used: 90, limit: 100 }, { metric: "channels", used: 1, limit: 5 }, { metric: "aiReplies", used: 5, limit: -1 }] })
    assert.deepEqual(usage.map((c: any) => c.key), ["usage_contacts"])
  })
  it("most severe first, and every card has Arabic text", () => {
    const cards = computeRecommendations({ ...base, automations: [], usage: [{ metric: "contacts", used: 85, limit: 100 }] })
    assert.equal(cards[0].severity, "high")
    for (const c of cards) assert.ok(c.title.ar && c.detail.ar && c.action.label.ar)
  })
})

describe("refresh frequency", () => {
  it("daily plans get a key per day, weekly plans one per ISO week", () => {
    assert.equal(periodKey("daily", new Date(NOW)), "2026-11-24")
    assert.equal(periodKey("weekly", new Date(NOW)), periodKey("weekly", new Date(NOW + 3 * 24 * h)))
    assert.notEqual(periodKey("weekly", new Date(NOW)), periodKey("weekly", new Date(NOW + 8 * 24 * h)))
  })
})

describe("getRecommendations", () => {
  function db(insights: unknown, stored: any = null) {
    const upserts: any[] = []
    return {
      upserts,
      from(table: string) {
        const q: any = {
          select: () => q, eq: () => q, in: () => q, gte: () => q, not: () => q, order: () => q, limit: () => q,
          upsert: (row: any) => { upserts.push(row); return q },
          maybeSingle: async () => ({
            data: table === "accounts" ? { id: "a1", plan: "monthly", role: "customer" }
              : table === "billing_accounts" ? { plan_id: "creator", status: "active", interval: "month", current_period_end: "2026-12-20T00:00:00Z" }
              : table === "ai_recommendations" ? stored : null, error: null }),
          then: (r: any) => r({ data: table === "plans" && insights ? [{ entitlements: insights }] : [], count: 0, error: null }),
        }
        return q
      },
    }
  }
  it("is refused when the plan has no recommendations", async () => {
    await assert.rejects(getRecommendations(db({ insights: "none" }), "a1", new Date(NOW)), InsightsDisabledError)
  })
  it("returns the stored batch without recomputing", async () => {
    const d = db(null, { items: [{ key: "x" }], summary: "s", generated_at: iso(NOW - h) })
    const batch = await getRecommendations(d, "a1", new Date(NOW))
    assert.equal(batch.cached, true)
    assert.equal(batch.level, "weekly")
    assert.equal(d.upserts.length, 0)
  })
  it("stores a new batch the first time in a period", async () => {
    const d = db({ aiRequests: 0 })
    const batch = await getRecommendations(d, "a1", new Date(NOW))
    assert.equal(batch.cached, false)
    assert.equal(d.upserts.length, 1)
    assert.equal(d.upserts[0].period_key, periodKey("weekly", new Date(NOW)))
  })
})
