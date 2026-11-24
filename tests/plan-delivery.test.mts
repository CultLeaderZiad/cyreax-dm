/**
 * The promise to a customer: pick a plan, create the account, pay, and you get
 * exactly that plan's features. Runs the real chain against the in-memory
 * Supabase fake: verified payment event -> billing row -> what the server
 * enforces and what the plan list shows.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { applyWhopEvent } = await import("../lib/billing/whop-sync.ts")
const { loadAccount, resolveAccountPlan } = await import("../lib/billing/enforce.ts")
const { featureEnabled, PLAN_CATALOG } = await import("../lib/billing/plans.ts")
const publicPlans = await import("../app/api/plans/route.ts")

const ACCOUNT = "aaaaaaaa-0000-0000-0000-00000000000a"
const TIERS = [
  { tier: "creator", planRow: "99999999-0000-0000-0000-000000000001", whop: "plan_IBbNH8TGcs1np", ref: "ref-starter" },
  { tier: "creator_plus", planRow: "99999999-0000-0000-0000-000000000002", whop: "plan_JtjPwHcMVU9lU", ref: "ref-pro" },
  { tier: "agency", planRow: "99999999-0000-0000-0000-000000000003", whop: "plan_CeX9JWzui6yd7", ref: "ref-agency" },
] as const

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

function seed(entitlements: Record<string, unknown> = {}) {
  const db = fakeDb()
  db.rpc = {}
  db.tables = {
    accounts: [{ id: ACCOUNT, email: "a@test.local", role: "customer", plan: "trial", trial_ends_at: inDays(-3) }],
    users: [{ id: 1, account_id: ACCOUNT }],
    billing_accounts: [],
    plans: TIERS.map((t, i) => ({
      id: t.planRow, name: ["Starter", "Pro", "Agency"][i], is_active: true, is_contact_sales: false, billing_cycle: "monthly",
      catalog_plan_id: t.tier, whop_variant_id: t.whop, whop_variant_id_yearly: null, price_usd: [19.99, 29.99, 44.99][i],
      features: [], created_at: `2026-01-0${i + 1}`, entitlements: entitlements[t.tier] ?? null,
    })),
    plan_agents: [],
    whop_checkouts: TIERS.map((t) => ({ ref: t.ref, account_id: ACCOUNT, plan_id: t.planRow, interval: "month", whop_variant_id: t.whop, membership_id: null })),
  }
}

async function pay(t: (typeof TIERS)[number]) {
  const db = await getSupabaseBypassClient()
  const membership = { id: "mem_test1", status: "active", variant_id: t.whop, current_period_end: inDays(30), expires_at: null, cancel_at_period_end: false, metadata: { cyreax_ref: t.ref, cyreax_account_id: ACCOUNT } }
  return applyWhopEvent(db, { type: "membership.activated", data: { id: "mem_test1" } }, { membership: async () => membership as any, payment: async () => ({}) })
}

describe("the plan a customer pays for is the plan they get", () => {
  beforeEach(() => seed())

  for (const t of TIERS) {
    it(`${t.tier}: after the verified payment the account has that plan's limits and features`, async () => {
      const db = await getSupabaseBypassClient()
      // Before paying: the ended trial is paused.
      const before = await resolveAccountPlan(db, (await loadAccount(db, ACCOUNT))!)
      assert.equal(before.blocked, true)

      assert.equal((await pay(t)).result, "applied")

      const after = await resolveAccountPlan(db, (await loadAccount(db, ACCOUNT))!)
      const tier = PLAN_CATALOG.find((p: any) => p.id === t.tier)!
      assert.equal(after.blocked, false)
      assert.equal(after.id, t.tier)
      assert.deepEqual(after.limits, tier.limits)
      assert.equal(featureEnabled(after, "aiAgent"), tier.limits.aiAgent)
      assert.equal(featureEnabled(after, "whiteLabel"), tier.limits.whiteLabel)
    })
  }

  it("the admin's limits for a plan reach the customer who paid for it, and the plan list shows the same", async () => {
    seed({ creator_plus: { channels: 9, aiAgent: false, aiRequests: 42 } })
    await pay(TIERS[1])
    const db = await getSupabaseBypassClient()
    const after = await resolveAccountPlan(db, (await loadAccount(db, ACCOUNT))!)
    assert.equal(after.limits.channels, 9)
    assert.equal(after.limits.aiAgent, false)
    assert.equal(after.limits.aiRequests, 42)

    const list = await (await publicPlans.GET()).json()
    const pro = list.find((p: any) => p.catalog_plan_id === "creator_plus")
    assert.equal(pro.effective_limits.channels, 9)
    assert.ok(pro.feature_lines.includes("9 channels"))
    assert.ok(!pro.feature_lines.includes("AI Growth Agent"))
  })

  it("paying for Starter never yields Pro or Agency features", async () => {
    await pay(TIERS[0])
    const db = await getSupabaseBypassClient()
    const after = await resolveAccountPlan(db, (await loadAccount(db, ACCOUNT))!)
    assert.equal(featureEnabled(after, "aiAgent"), false)
    assert.equal(featureEnabled(after, "whiteLabel"), false)
    assert.equal(after.limits.workspaces, 1)
  })

  it("an event for a checkout that belongs to a different plan grants nothing", async () => {
    const db = await getSupabaseBypassClient()
    // The buyer paid for the Starter variant but the checkout we recorded was for Agency.
    const membership = { id: "mem_test2", status: "active", variant_id: TIERS[0].whop, current_period_end: inDays(30), expires_at: null, cancel_at_period_end: false, metadata: { cyreax_ref: TIERS[2].ref, cyreax_account_id: ACCOUNT } }
    const r = await applyWhopEvent(db, { type: "membership.activated", data: { id: "mem_test2" } }, { membership: async () => membership as any, payment: async () => ({}) })
    assert.equal(r.result, "ignored")
    assert.equal(fakeDb().tables.billing_accounts.length, 0)
  })
})
