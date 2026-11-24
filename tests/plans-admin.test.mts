/**
 * Admin -> Plans controls and the public plan list, against the in-memory
 * Supabase fake. Admin edits must be validated, restricted to admins, and
 * visible immediately in what customers see.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")

const ADMIN = "aaaaaaaa-0000-0000-0000-00000000000a"
const USER = "bbbbbbbb-0000-0000-0000-00000000000b"
const PLAN = "99999999-0000-0000-0000-000000000001"

function seed() {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.tables = {
    accounts: [
      { id: ADMIN, email: "admin@test.local", role: "admin", plan: "monthly", active_workspace_id: "wA" },
      { id: USER, email: "user@test.local", role: "customer", plan: "monthly", active_workspace_id: "wB" },
    ],
    workspaces: [
      { id: "wA", name: "A", owner_account_id: ADMIN, created_at: "2026-01-01" },
      { id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" },
    ],
    workspace_members: [
      { workspace_id: "wA", account_id: ADMIN, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" },
    ],
    users: [
      { id: 1, account_id: ADMIN, workspace_id: "wA", username: "admin", created_at: "2026-01-01" },
      { id: 2, account_id: USER, workspace_id: "wB", username: "user", created_at: "2026-01-01" },
    ],
    plans: [
      { id: PLAN, name: "Starter", is_active: true, is_contact_sales: false, catalog_plan_id: "creator", billing_cycle: "monthly", price_usd: 19.99, features: ["Email support"], created_at: "2026-01-01", entitlements: null },
    ],
    plan_agents: [],
  }
}
const as = (id: string | null) => { fakeDb().authUserId = id }
const put = (body: unknown) => new NextRequest(`https://app.test/api/admin/plans/${PLAN}`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

const adminPlan = await import("../app/api/admin/plans/[id]/route.ts")
const adminPlans = await import("../app/api/admin/plans/route.ts")
const publicPlans = await import("../app/api/plans/route.ts")
const ctx = { params: Promise.resolve({ id: PLAN }) }

describe("Admin -> Plans entitlements", () => {
  beforeEach(() => { seed(); as(ADMIN) })

  it("an admin changes limits and features of a plan, and only valid values are stored", async () => {
    const res = await adminPlan.PUT(put({ entitlements: { channels: 9, aiAgent: true, insights: "daily", seats: "x", hack: 1 } }), ctx)
    assert.equal(res.status, 200)
    assert.deepEqual(fakeDb().tables.plans[0].entitlements, { channels: 9, aiAgent: true, insights: "daily" })
  })

  it("null resets a plan to the tier defaults", async () => {
    fakeDb().tables.plans[0].entitlements = { channels: 9 }
    await adminPlan.PUT(put({ entitlements: null }), ctx)
    assert.equal(fakeDb().tables.plans[0].entitlements, null)
  })

  it("customers and anonymous callers cannot edit plans", async () => {
    as(USER)
    assert.equal((await adminPlan.PUT(put({ entitlements: { channels: 999 } }), ctx)).status, 403)
    as(null)
    assert.equal((await adminPlan.PUT(put({ entitlements: { channels: 999 } }), ctx)).status, 401)
    assert.equal(fakeDb().tables.plans[0].entitlements, null)
  })

  it("a new plan is created with validated entitlements", async () => {
    const res = await adminPlans.POST(new NextRequest("https://app.test/api/admin/plans", {
      method: "POST",
      body: JSON.stringify({ name: "Pro", price_usd: 29.99, billing_cycle: "monthly", is_active: true, catalog_plan_id: "creator_plus", entitlements: { aiAgent: true, contacts: 123, nope: 1 } }),
      headers: { "content-type": "application/json" },
    }))
    assert.equal(res.status, 200)
    const created = fakeDb().tables.plans.find((p) => p.name === "Pro")!
    assert.deepEqual(created.entitlements, { aiAgent: true, contacts: 123 })
  })

  it("rejects a malformed Whop plan id", async () => {
    assert.equal((await adminPlan.PUT(put({ whop_variant_id: "https://whop.com/x" }), ctx)).status, 400)
  })
})

describe("public plan list", () => {
  beforeEach(() => { seed(); as(null) })

  it("returns the limits the server enforces and the lines generated from them", async () => {
    const [plan] = await (await publicPlans.GET()).json()
    assert.equal(plan.effective_limits.channels, 2)
    assert.equal(plan.effective_limits.aiAgent, false)
    assert.ok(plan.feature_lines.includes("2 channels"))
    assert.ok(!plan.feature_lines.includes("AI Growth Agent"))
  })

  it("an admin's change shows up immediately", async () => {
    fakeDb().tables.plans[0].entitlements = { channels: 6, aiAgent: true }
    const [plan] = await (await publicPlans.GET()).json()
    assert.equal(plan.effective_limits.channels, 6)
    assert.ok(plan.feature_lines.includes("6 channels"))
    assert.ok(plan.feature_lines.includes("AI Growth Agent"))
  })
})
