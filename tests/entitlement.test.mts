import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { resolveAccountPlan, activePeriodValid, LIFETIME_INTERVAL } = await import("../lib/billing/enforce.ts")

const NOW = Date.parse("2026-11-17T12:00:00Z")
const day = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

function dbWith(billing: Record<string, unknown> | null) {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: billing, error: null }),
  }
  return { from: () => q }
}

const account = { id: "acc-1", plan: "monthly", role: "customer" }

describe("paid access ends at current_period_end even if the cron is late", () => {
  it("active with a future end is entitled to its plan", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "agency_pro", status: "active", interval: "month", current_period_end: iso(NOW + day) }), account, NOW)
    assert.equal(plan.id, "agency_pro")
  })

  it("active with a past end is not entitled, regardless of accounts.plan", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "agency_pro", status: "active", interval: "month", current_period_end: iso(NOW - 1000) }), account, NOW)
    assert.equal(plan.id, "expired")
  })

  it("past_due after the period end is not paid time", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "agency_pro", status: "past_due", interval: "month", current_period_end: iso(NOW - day) }), account, NOW)
    assert.equal(plan.id, "expired")
  })

  it("a missing end date is not lifetime", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "agency_pro", status: "active", interval: "month", current_period_end: null }), account, NOW)
    assert.equal(plan.id, "expired")
  })

  it("only the explicit lifetime marker never expires", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "agency_pro", status: "active", interval: LIFETIME_INTERVAL, current_period_end: null }), account, NOW)
    assert.equal(plan.id, "agency_pro")
    assert.equal(activePeriodValid({ interval: LIFETIME_INTERVAL }, NOW), true)
  })

  it("yearly behaves like monthly", () => {
    assert.equal(activePeriodValid({ interval: "year", current_period_end: iso(NOW + 300 * day) }, NOW), true)
    assert.equal(activePeriodValid({ interval: "year", current_period_end: iso(NOW - 1) }, NOW), false)
    assert.equal(activePeriodValid({ interval: "year", current_period_end: "not a date" }, NOW), false)
  })

  it("admins are unaffected", async () => {
    const plan = await resolveAccountPlan(dbWith({ plan_id: "x", status: "active", current_period_end: iso(NOW - day) }), { ...account, role: "admin" }, NOW)
    assert.notEqual(plan.id, "expired")
  })
})

describe("one source of truth: Whop and manual rows entitle the same way", () => {
  for (const provider of ["whop", "manual"]) {
    it(`${provider}: active until current_period_end, lifetime forever, expired after`, async () => {
      const base = { plan_id: "agency_pro", payment_provider: provider }
      assert.equal((await resolveAccountPlan(dbWith({ ...base, status: "active", interval: "month", current_period_end: iso(NOW + day) }), account, NOW)).id, "agency_pro")
      assert.equal((await resolveAccountPlan(dbWith({ ...base, status: "active", interval: "lifetime", current_period_end: null }), account, NOW)).id, "agency_pro")
      assert.equal((await resolveAccountPlan(dbWith({ ...base, status: "active", interval: "year", current_period_end: iso(NOW - 1) }), account, NOW)).id, "expired")
      assert.equal((await resolveAccountPlan(dbWith({ ...base, status: "canceled", interval: "month", current_period_end: iso(NOW + day) }), account, NOW)).id, "expired")
    })
  }
})
