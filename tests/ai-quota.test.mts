import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { judgeAiQuota, assertAiQuota, AiQuotaError, monthStart } = await import("../lib/ai/quota.ts")

const NOW = new Date("2026-11-24T12:00:00Z")
const billing = { plan_id: "creator", status: "active", interval: "month", current_period_end: "2026-12-20T00:00:00Z" }

function db(opts: { used: number; entitlements?: unknown; billing?: unknown }) {
  const seen: any = {}
  return {
    seen,
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q, not: (...a: any[]) => { seen.not = a; return q }, limit: () => q,
        in: () => q, gte: (_c: string, v: string) => { seen.since = v; return q },
        maybeSingle: async () => ({ data: table === "billing_accounts" ? ("billing" in opts ? opts.billing : billing) : table === "plans" && opts.entitlements ? { entitlements: opts.entitlements } : null, error: null }),
        then: (resolve: any) => resolve(
          table === "users" ? { data: [{ id: 1 }], error: null }
          : table === "ai_usage_log" ? { data: null, count: opts.used, error: null }
          : table === "plans" ? { data: opts.entitlements ? [{ entitlements: opts.entitlements }] : [], error: null }
          : { data: null, error: null }),
      }
      return q
    },
  }
}
const account = { id: "a1", plan: "monthly", role: "customer" }

describe("monthly AI request quota", () => {
  it("judges used vs limit, -1 is unlimited", () => {
    assert.equal(judgeAiQuota(299, 300).allowed, true)
    assert.equal(judgeAiQuota(300, 300).allowed, false)
    assert.equal(judgeAiQuota(10 ** 9, -1).allowed, true)
    assert.equal(judgeAiQuota(0, 0).allowed, false)
  })
  it("counts from the first of the month", () => {
    assert.equal(monthStart(NOW), "2026-11-01T00:00:00.000Z")
  })
  it("allows under the plan limit and blocks at it", async () => {
    await assertAiQuota(db({ used: 10 }), account, "growth_insights", NOW)
    await assert.rejects(assertAiQuota(db({ used: 300 }), account, "growth_insights", NOW), AiQuotaError)
  })
  it("the admin's limit applies immediately", async () => {
    await assertAiQuota(db({ used: 300, entitlements: { aiRequests: 1000 } }), account, "growth_insights", NOW)
    await assert.rejects(assertAiQuota(db({ used: 5, entitlements: { aiRequests: 5 } }), account, "growth_insights", NOW), AiQuotaError)
    await assertAiQuota(db({ used: 10 ** 6, entitlements: { aiRequests: -1 } }), account, "growth_insights", NOW)
  })
  it("auto-replies use the aiReplies meter, not this quota", async () => {
    await assertAiQuota(db({ used: 10 ** 6 }), account, "auto_reply", NOW)
  })
  it("a paused account (ended trial) cannot spend", async () => {
    const ended = { id: "a1", plan: "trial", role: "customer", trial_ends_at: "2026-11-01T00:00:00Z" }
    await assert.rejects(assertAiQuota(db({ used: 0, billing: null }), ended, "growth_insights", NOW), AiQuotaError)
  })
})
