import assert from "node:assert/strict"
import { describe, it } from "node:test"

const plans = await import("../lib/billing/plans.ts")
const { PLAN_CATALOG, TRIAL_DAYS, TRIAL_PLAN_ID, resolvePlan, featureEnabled, sanitizeEntitlements, applyEntitlements, describeEntitlements } = plans
const { resolveAccountPlan } = await import("../lib/billing/enforce.ts")
const { gateReason } = await import("../lib/billing/gate.ts")

const NOW = Date.parse("2026-11-24T12:00:00Z")
const day = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

/** Minimal chainable Supabase stub: rows per table, ignoring filters (one row each). */
function db(tables: Record<string, any>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? null, error: null }
      const q: any = {
        select: () => q, eq: () => q, not: () => q, limit: () => q,
        maybeSingle: async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }),
        then: (resolve: any) => resolve({ data: result.data, error: null }),
      }
      return q
    },
  }
}

describe("Starter, Pro and Agency", () => {
  const sellable = PLAN_CATALOG.filter((p: any) => !p.hidden)

  it("are the three sold tiers, in price order", () => {
    assert.deepEqual(sellable.map((p: any) => p.name), ["Starter", "Pro", "Agency"])
    assert.ok(sellable[0].monthlyUsd < sellable[1].monthlyUsd && sellable[1].monthlyUsd < sellable[2].monthlyUsd)
  })

  it("the AI Growth Agent starts at Pro, Starter does not have it", () => {
    assert.equal(featureEnabled(resolvePlan("starter"), "aiAgent"), false)
    assert.equal(featureEnabled(resolvePlan("pro"), "aiAgent"), true)
    assert.equal(featureEnabled(resolvePlan("agency"), "aiAgent"), true)
  })

  it("each tier has its own features", () => {
    assert.equal(resolvePlan("starter").limits.insights, "weekly")
    assert.equal(resolvePlan("pro").limits.insights, "daily")
    assert.equal(featureEnabled(resolvePlan("pro"), "whiteLabel"), false)
    assert.equal(featureEnabled(resolvePlan("agency"), "whiteLabel"), true)
    assert.ok(resolvePlan("agency").limits.workspaces > resolvePlan("pro").limits.workspaces)
  })

  it("a 7-day trial runs on Pro", () => {
    assert.equal(TRIAL_DAYS, 7)
    assert.equal(resolvePlan("trial").id, TRIAL_PLAN_ID)
    assert.equal(featureEnabled(resolvePlan("trial"), "aiAgent"), true)
    for (const p of sellable) assert.equal(p.trialDays, 7)
  })
})

describe("admin-controlled entitlements", () => {
  it("only known, valid values are kept", () => {
    assert.deepEqual(
      sanitizeEntitlements({ channels: 9, contacts: -1, aiReplies: 1.5, seats: "3", whiteLabel: true, aiAgent: "yes", insights: "hourly", evil: 1, workspaces: 2_000_000_000 }),
      { channels: 9, contacts: -1, whiteLabel: true },
    )
    assert.deepEqual(sanitizeEntitlements(null), {})
    assert.deepEqual(sanitizeEntitlements("x"), {})
    assert.deepEqual(sanitizeEntitlements({ insights: "daily", seats: -2 }), { insights: "daily" })
  })

  it("overrides sit on top of the tier defaults without mutating the catalog", () => {
    const starter = resolvePlan("starter")
    const custom = applyEntitlements(starter, { channels: 7, aiAgent: true })
    assert.equal(custom.limits.channels, 7)
    assert.equal(custom.limits.aiAgent, true)
    assert.equal(custom.limits.contacts, starter.limits.contacts)
    assert.equal(resolvePlan("starter").limits.channels, 2)
    assert.equal(applyEntitlements(starter, {}), starter)
  })

  it("customers read lines generated from the real limits", () => {
    const lines = describeEntitlements(applyEntitlements(resolvePlan("starter"), { channels: 4, aiAgent: true, aiReplies: -1 }).limits)
    assert.ok(lines.includes("4 channels"))
    assert.ok(lines.includes("AI Growth Agent"))
    assert.ok(lines.some((l: string) => l.startsWith("Unlimited AI replies")))
    assert.ok(!describeEntitlements(resolvePlan("starter").limits).includes("AI Growth Agent"))
  })

  it("the server enforces what the admin set, with no deploy", async () => {
    const account = { id: "a1", plan: "monthly", role: "customer" }
    const billing = { plan_id: "creator", status: "active", interval: "month", current_period_end: iso(NOW + day) }
    const defaults = await resolveAccountPlan(db({ billing_accounts: billing, plans: [] }), account, NOW)
    assert.equal(defaults.limits.channels, 2)
    assert.equal(defaults.limits.aiAgent, false)
    const custom = await resolveAccountPlan(db({ billing_accounts: billing, plans: [{ entitlements: { channels: 6, aiAgent: true } }] }), account, NOW)
    assert.equal(custom.limits.channels, 6)
    assert.equal(custom.limits.aiAgent, true)
    assert.equal(custom.id, "creator")
  })

  it("garbage in the column cannot grant anything", async () => {
    const account = { id: "a1", plan: "monthly", role: "customer" }
    const billing = { plan_id: "creator", status: "active", interval: "month", current_period_end: iso(NOW + day) }
    const plan = await resolveAccountPlan(db({ billing_accounts: billing, plans: [{ entitlements: { channels: "999999", hack: true, aiAgent: "true" } }] }), account, NOW)
    assert.equal(plan.limits.channels, 2)
    assert.equal(plan.limits.aiAgent, false)
  })
})

describe("free trial", () => {
  it("a running trial gets Pro features with no billing row and no card", async () => {
    const account = { id: "a1", plan: "trial", role: "customer", trial_ends_at: iso(NOW + 3 * day) }
    const plan = await resolveAccountPlan(db({ billing_accounts: null, plans: [] }), account, NOW)
    assert.equal(plan.id, "creator_plus")
    assert.equal(plan.blocked, false)
    assert.equal(plan.limits.aiAgent, true)
  })

  it("a finished trial pauses the account instead of dropping to a free tier", async () => {
    const account = { id: "a1", plan: "trial", role: "customer", trial_ends_at: iso(NOW - 1000) }
    const plan = await resolveAccountPlan(db({ billing_accounts: null, plans: [] }), account, NOW)
    assert.equal(plan.id, "expired")
    assert.equal(plan.blocked, true)
    assert.equal(featureEnabled(plan, "aiAgent"), false)
    const viaBilling = await resolveAccountPlan(db({ billing_accounts: { plan_id: "creator_plus", status: "trialing", trial_ends_at: iso(NOW - 1000) }, plans: [] }), { id: "a1", plan: "trial", role: "customer" }, NOW)
    assert.equal(viaBilling.blocked, true)
  })

  it("an admin-exempt trial keeps running", async () => {
    const account = { id: "a1", plan: "trial", role: "customer", trial_ends_at: iso(NOW - day), trial_exempt: true }
    const plan = await resolveAccountPlan(db({ billing_accounts: null, plans: [] }), account, NOW)
    assert.equal(plan.blocked, false)
  })
})

describe("the choose-a-plan-or-log-out screen", () => {
  const ended = { plan: "trial", isTrialExpired: true, isPastDeadline: true }
  it("appears the moment the trial ends, with no grace period", () => {
    assert.equal(gateReason({ ...ended }), "trial")
  })
  it("appears for a paid account whose subscription is no longer valid", () => {
    assert.equal(gateReason({ plan: "creator", hasValidPayment: false, isPastDeadline: true }), "subscription")
  })
  it("never appears for admins, exempt accounts, running trials or valid subscriptions", () => {
    assert.equal(gateReason({ ...ended, role: "admin" }), null)
    assert.equal(gateReason({ ...ended, trialExempt: true }), null)
    assert.equal(gateReason({ plan: "trial", isTrialExpired: false, isPastDeadline: false }), null)
    assert.equal(gateReason({ plan: "creator", hasValidPayment: true, isPastDeadline: true }), null)
  })
})
