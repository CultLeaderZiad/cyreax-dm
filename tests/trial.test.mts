/**
 * Per-plan free trials: the admin sets the length and the quota percentage of
 * each plan, the trial gives that plan's features with the costly quotas
 * scaled down, and one account cannot restart its trial.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const plans = await import("../lib/billing/plans.ts")
const { resolveAccountPlan } = await import("../lib/billing/enforce.ts")
const trialRoute = await import("../app/api/billing/trial/route.ts")
const { sanitizeEntitlements, scaleForTrial, resolvePlan, featureEnabled, PLAN_CATALOG } = plans

const day = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const USER = "bbbbbbbb-0000-0000-0000-00000000000b"
const PRO_ROW = "99999999-0000-0000-0000-000000000002"

describe("trial settings an admin can set", () => {
  it("every sold plan offers a trial by default, internal tiers do not", () => {
    for (const p of PLAN_CATALOG.filter((c: any) => !c.hidden)) assert.equal(p.limits.trialDays, 7)
    for (const p of PLAN_CATALOG.filter((c: any) => c.hidden)) assert.equal(p.limits.trialDays, 0)
  })
  it("trialDays is 0..90 and the percentage 1..100, anything else is dropped", () => {
    assert.deepEqual(sanitizeEntitlements({ trialDays: 14, trialLimitPercent: 40 }), { trialDays: 14, trialLimitPercent: 40 })
    assert.deepEqual(sanitizeEntitlements({ trialDays: 91, trialLimitPercent: 0 }), {})
    assert.deepEqual(sanitizeEntitlements({ trialDays: -1, trialLimitPercent: 101 }), {})
    assert.deepEqual(sanitizeEntitlements({ trialDays: 3.5, trialLimitPercent: "50" }), {})
  })
})

describe("what a trial gets", () => {
  it("keeps features and structural limits, scales only the costly quotas", () => {
    const pro = resolvePlan("creator_plus").limits
    const t = scaleForTrial({ ...pro, trialLimitPercent: 20 })
    assert.equal(t.aiReplies, Math.ceil(pro.aiReplies * 0.2))
    assert.equal(t.aiRequests, Math.ceil(pro.aiRequests * 0.2))
    assert.equal(t.broadcasts, Math.ceil(pro.broadcasts * 0.2))
    assert.equal(t.channels, pro.channels)
    assert.equal(t.contacts, pro.contacts)
    assert.equal(t.aiAgent, pro.aiAgent)
  })
  it("an unlimited quota is capped during a trial, and 100% changes nothing", () => {
    const agency = resolvePlan("agency").limits
    assert.equal(scaleForTrial({ ...agency, trialLimitPercent: 50 }).broadcasts, 1000)
    assert.equal(scaleForTrial({ ...agency, trialLimitPercent: 100 }).aiReplies, agency.aiReplies)
  })

  const db = (tables: Record<string, any>) => ({
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q, not: () => q, limit: () => q,
        maybeSingle: async () => ({ data: Array.isArray(tables[table]) ? tables[table][0] ?? null : tables[table] ?? null, error: null }),
        then: (r: any) => r({ data: tables[table] ?? null, error: null }),
      }
      return q
    },
  })
  const account = { id: "a1", plan: "monthly", role: "customer" }
  const now = Date.now()

  it("a trial of the chosen plan runs on THAT plan's features with scaled quotas; a paid period is never scaled", async () => {
    const trialing = { plan_id: "creator", status: "trialing", trial_ends_at: iso(now + 3 * day) }
    const t = await resolveAccountPlan(db({ billing_accounts: trialing, plans: [] }), account, now)
    assert.equal(t.id, "creator")
    assert.equal(t.trial, true)
    assert.equal(featureEnabled(t, "aiAgent"), false, "Starter trial does not get the Pro agent")
    assert.ok(t.limits.aiReplies < resolvePlan("creator").limits.aiReplies)

    const paid = { plan_id: "creator", status: "active", interval: "month", current_period_end: iso(now + day) }
    const p = await resolveAccountPlan(db({ billing_accounts: paid, plans: [] }), account, now)
    assert.equal(p.limits.aiReplies, resolvePlan("creator").limits.aiReplies)
    assert.ok(!p.trial)
  })

  it("the admin's percentage and overrides apply to the trial", async () => {
    const trialing = { plan_id: "creator_plus", status: "trialing", trial_ends_at: iso(now + day) }
    const t = await resolveAccountPlan(db({ billing_accounts: trialing, plans: [{ entitlements: { trialLimitPercent: 50, aiReplies: 1000 } }] }), account, now)
    assert.equal(t.limits.aiReplies, 500)
  })

  it("inside the 12-hour grace the chosen plan stays, with trial quotas", async () => {
    const ended = { plan_id: "creator_plus", status: "trialing", trial_ends_at: iso(now - 2 * 3_600_000) }
    const t = await resolveAccountPlan(db({ billing_accounts: ended, plans: [] }), account, now)
    assert.equal(t.id, "creator_plus")
    assert.equal(t.blocked, false)
    assert.equal(t.trial, true)
  })
})

describe("POST /api/billing/trial", () => {
  function seed(opts: { accountTrialEnds?: string | null; billing?: Record<string, unknown> | null; entitlements?: unknown } = {}) {
    const d = fakeDb()
    d.emailConfirmed = true
    d.rpc = {}
    d.authUserId = USER
    d.tables = {
      accounts: [{ id: USER, email: "u@test.local", role: "customer", plan: "trial", trial_ends_at: opts.accountTrialEnds ?? null, active_workspace_id: "wB" }],
      workspaces: [{ id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" }],
      workspace_members: [{ workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" }],
      users: [{ id: 2, account_id: USER, workspace_id: "wB", username: "u" }],
      billing_accounts: opts.billing ? [{ account_id: USER, ...opts.billing }] : [],
      plans: [{ id: PRO_ROW, name: "Pro", is_active: true, is_contact_sales: false, catalog_plan_id: "creator_plus", entitlements: opts.entitlements ?? null }],
    }
  }
  const post = (planId: string) => trialRoute.POST(new NextRequest("https://app.test/api/billing/trial", { method: "POST", body: JSON.stringify({ planId }), headers: { "content-type": "application/json" } }))

  it("starts a trial of the chosen plan for the days the admin set", async () => {
    seed({ entitlements: { trialDays: 14 } })
    const res = await post(PRO_ROW)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.planId, "creator_plus")
    const days = Math.round((Date.parse(body.trialEndsAt) - Date.now()) / day)
    assert.equal(days, 14)
    assert.equal(fakeDb().tables.billing_accounts[0].status, "trialing")
  })

  it("a plan the admin set to 0 trial days has no trial", async () => {
    seed({ entitlements: { trialDays: 0 } })
    assert.equal((await post(PRO_ROW)).status, 409)
    assert.equal(fakeDb().tables.billing_accounts.length, 0)
  })

  it("an account whose sign-up trial already ran out cannot start another", async () => {
    seed({ accountTrialEnds: iso(Date.now() - 2 * day) })
    assert.equal((await post(PRO_ROW)).status, 409)
    assert.equal(fakeDb().tables.billing_accounts.length, 0)
  })

  it("a second trial after a billing trial is refused", async () => {
    seed({ billing: { plan_id: "creator", status: "expired", trial_ends_at: iso(Date.now() - 10 * day) } })
    assert.equal((await post(PRO_ROW)).status, 409)
  })

  it("the internal tiers and unknown plans cannot be trialed", async () => {
    seed()
    assert.equal((await post("agency_pro")).status, 404)
    assert.equal((await post("99999999-0000-0000-0000-0000000000ff")).status, 404)
  })
})
