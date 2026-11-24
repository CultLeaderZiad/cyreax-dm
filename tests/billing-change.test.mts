/**
 * POST /api/billing/change must never hand out a paid plan, or any plan, to an
 * account that has not paid: a trial, expired or never-paid account is sent to
 * checkout, and the internal Free and Unlimited tiers cannot be chosen.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const route = await import("../app/api/billing/change/route.ts")

const USER = "bbbbbbbb-0000-0000-0000-00000000000b"
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

function seed(billing: Record<string, unknown> | null, plan = "trial") {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.authUserId = USER
  db.tables = {
    accounts: [{ id: USER, email: "u@test.local", role: "customer", plan, active_workspace_id: "wB", trial_ends_at: inDays(-3) }],
    workspaces: [{ id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" }],
    workspace_members: [{ workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" }],
    users: [{ id: 2, account_id: USER, workspace_id: "wB", username: "user", created_at: "2026-01-01" }],
    billing_accounts: billing ? [{ account_id: USER, ...billing }] : [],
  }
}
const post = (planId: string) =>
  route.POST(new NextRequest("https://app.test/api/billing/change", { method: "POST", body: JSON.stringify({ planId }), headers: { "content-type": "application/json" } }))

describe("plan change requires payment first", () => {
  beforeEach(() => seed(null))

  it("an account that never paid is sent to checkout and nothing is written", async () => {
    for (const planId of ["creator", "creator_plus", "agency"]) {
      const res = await post(planId)
      assert.equal((await res.json()).checkoutRequired, true)
    }
    assert.equal(fakeDb().tables.billing_accounts.length, 0)
  })

  it("an ended trial, an expired or a canceled subscription cannot self-grant a cheaper plan", async () => {
    for (const status of ["trialing", "expired", "canceled"]) {
      seed({ plan_id: "creator_plus", status, interval: "month", current_period_end: inDays(10) })
      const res = await post("creator")
      assert.equal((await res.json()).checkoutRequired, true, status)
      assert.equal(fakeDb().tables.billing_accounts[0].plan_id, "creator_plus")
    }
  })

  it("an active subscription whose paid period is over is not treated as paid", async () => {
    seed({ plan_id: "creator_plus", status: "active", interval: "month", current_period_end: inDays(-1) })
    assert.equal((await (await post("creator")).json()).checkoutRequired, true)
  })

  it("the internal Free and Unlimited tiers cannot be chosen", async () => {
    for (const planId of ["creator_free", "agency_pro", "expired", "nonsense"]) {
      assert.equal((await post(planId)).status, 400, planId)
    }
  })

  it("a paying customer can still schedule a downgrade for the end of the period", async () => {
    seed({ plan_id: "creator_plus", status: "active", interval: "month", current_period_end: inDays(10) }, "monthly")
    const body = await (await post("creator")).json()
    assert.equal(body.scheduled, "creator")
    assert.equal(fakeDb().tables.billing_accounts[0].plan_id, "creator_plus")
  })

  it("a paying customer upgrading is sent to checkout, not upgraded for free", async () => {
    seed({ plan_id: "creator", status: "active", interval: "month", current_period_end: inDays(10) }, "monthly")
    assert.equal((await (await post("agency")).json()).checkoutRequired, true)
  })
})
