/**
 * The session endpoint decides what a customer sees first. Onboarding must not
 * appear for someone who has not paid (a trial or a never-paid account), and a
 * paying customer must land on "waiting for access approval", not on the form.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const me = await import("../app/api/auth/me/route.ts")

const USER = "bbbbbbbb-0000-0000-0000-00000000000b"
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

function seed(billing: Record<string, unknown> | null, accountPlan = "trial") {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.authUserId = USER
  db.tables = {
    accounts: [{ id: USER, email: "u@test.local", role: "customer", plan: accountPlan, trial_ends_at: inDays(3), active_workspace_id: "wB", created_at: new Date().toISOString() }],
    workspaces: [{ id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" }],
    workspace_members: [{ workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" }],
    users: [{ id: 2, account_id: USER, workspace_id: "wB", username: "u", access_token: "workspace_managed", plan: accountPlan, trial_ends_at: inDays(3) }],
    billing_accounts: billing ? [{ account_id: USER, ...billing }] : [],
    account_onboarding: [],
    platform_connections: [],
    payment_submissions: [],
    subscriptions: [],
  }
}
const call = async () => (await me.GET(new NextRequest("https://app.test/api/auth/me"))).json()

describe("/api/auth/me onboarding", () => {
  it("a customer who has not paid (trial, never paid) is not put into onboarding", async () => {
    seed(null)
    const body = await call()
    assert.equal(body.onboarding_status, null)
    assert.equal(body.onboarding_required, false)
    assert.equal(fakeDb().tables.account_onboarding.length, 0)

    seed({ plan_id: "creator_plus", status: "trialing", trial_ends_at: inDays(3) })
    assert.equal((await call()).onboarding_status, null)
    assert.equal(fakeDb().tables.account_onboarding.length, 0)
  })

  it("a paying customer waits for access approval first; the form does not open", async () => {
    seed({ plan_id: "creator_plus", status: "active", interval: "month", current_period_end: inDays(20) }, "monthly")
    const body = await call()
    assert.equal(body.has_valid_payment, true)
    assert.equal(body.onboarding_status, "awaiting_access")
    assert.equal(body.onboarding_required, false)
    assert.equal(fakeDb().tables.account_onboarding[0].status, "awaiting_access")
    // reading again keeps one row in the same state
    await call()
    assert.equal(fakeDb().tables.account_onboarding.length, 1)
  })

  it("the details form opens only once the admin granted access, then review, then the dashboard", async () => {
    seed({ plan_id: "creator_plus", status: "active", interval: "month", current_period_end: inDays(20) }, "monthly")
    await call()
    const row = () => fakeDb().tables.account_onboarding[0]
    row().status = "access_granted"
    let body = await call()
    assert.deepEqual([body.onboarding_required, body.onboarding_status], [true, "access_granted"])
    row().status = "submitted"
    body = await call()
    assert.deepEqual([body.onboarding_required, body.onboarding_status], [false, "submitted"])
    row().status = "approved"
    body = await call()
    assert.deepEqual([body.onboarding_required, body.onboarding_status], [false, "approved"])
  })
})
