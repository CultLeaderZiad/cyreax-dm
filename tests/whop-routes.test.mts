/**
 * Whop checkout and webhook routes against the in-memory Supabase fake, with
 * Whop's API stubbed (no network). Signatures are made the way Whop signs.
 */
import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { createHmac } from "node:crypto"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const B = "bbbbbbbb-0000-0000-0000-00000000000b"
const PLAN = "99999999-0000-0000-0000-000000000001"
const LIFE = "99999999-0000-0000-0000-000000000002"
const SECRET = "ws_test_0123456789abcdef0123456789abcdef"

process.env.WHOP_API_KEY = "test-key"
process.env.WHOP_WEBHOOK_SECRET = SECRET

function seed() {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.tables = {
    accounts: [
      { id: A, email: "a@test.local", role: "customer", plan: "trial", active_workspace_id: "wA" },
      { id: B, email: "b@test.local", role: "customer", plan: "trial", active_workspace_id: "wB" },
    ],
    workspaces: [
      { id: "wA", name: "A", owner_account_id: A, created_at: "2026-01-01" },
      { id: "wB", name: "B", owner_account_id: B, created_at: "2026-01-01" },
    ],
    workspace_members: [
      { workspace_id: "wA", account_id: A, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wB", account_id: B, role: "owner", created_at: "2026-01-01" },
    ],
    users: [
      { id: 1001, account_id: A, workspace_id: "wA", username: "a", created_at: "2026-01-01" },
      { id: 2002, account_id: B, workspace_id: "wB", username: "b", created_at: "2026-01-01" },
    ],
    plans: [
      { id: PLAN, name: "Agency Pro", is_active: true, is_contact_sales: false, catalog_plan_id: "agency_pro", billing_cycle: "monthly", whop_variant_id: "plan_ProMonthly1", whop_variant_id_yearly: "plan_ProYearly1" },
      { id: LIFE, name: "Lifetime", is_active: true, is_contact_sales: false, catalog_plan_id: "creator_plus", billing_cycle: "lifetime", whop_variant_id: "plan_Life1", whop_variant_id_yearly: null },
    ],
    whop_checkouts: [],
    whop_webhook_events: [],
    billing_accounts: [],
    notifications: [],
  }
  return db
}
const as = (id: string | null) => { fakeDb().authUserId = id }
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

// ---- Whop API stub -------------------------------------------------------
const realFetch = globalThis.fetch
let whopCalls: Array<{ url: string; method: string; body: any; auth: string | null }> = []
let memberships: Record<string, any> = {}
let payments: Record<string, any> = {}
function stubWhop() {
  whopCalls = []
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input)
    const headers = new Headers(init.headers)
    whopCalls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, auth: headers.get("authorization") })
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    if (url.endsWith("/checkout_configurations")) return reply(200, { id: "ch_test1", purchase_url: "https://whop.com/checkout/ch_test1" })
    const mem = url.match(/\/memberships\/(mem_\w+)$/)
    if (mem) return memberships[mem[1]] ? reply(200, memberships[mem[1]]) : reply(404, { error: { message: "not found" } })
    const pay = url.match(/\/payments\/(pay_\w+)$/)
    if (pay) return payments[pay[1]] ? reply(200, payments[pay[1]]) : reply(404, { error: { message: "not found" } })
    return reply(404, {})
  }) as typeof fetch
}

const checkoutRoute = await import("../app/api/billing/whop/checkout/route.ts")

describe("Whop checkout", () => {
  beforeEach(() => { seed(); stubWhop(); as(A) })
  afterEach(() => { globalThis.fetch = realFetch })

  it("creates a checkout for the session's account, ignoring any account in the body", async () => {
    const res = await checkoutRoute.POST(new NextRequest("https://app.test/api/billing/whop/checkout", json({ planId: PLAN, accountId: B })))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).url, "https://whop.com/checkout/ch_test1")
    const row = fakeDb().tables.whop_checkouts[0]
    assert.equal(row.account_id, A)
    assert.equal(row.whop_variant_id, "plan_ProMonthly1")
    assert.equal(row.interval, "month")
    assert.equal(row.checkout_configuration_id, "ch_test1")
    const call = whopCalls.find((c) => c.url.endsWith("/checkout_configurations"))!
    assert.equal(call.method, "POST")
    assert.equal(call.auth, "Bearer test-key")
    assert.equal(call.body.variant_id, "plan_ProMonthly1")
    assert.deepEqual(call.body.metadata, { cyreax_ref: row.ref, cyreax_account_id: A, cyreax_plan_id: PLAN })
  })

  it("sells the yearly variant for cycle=yearly", async () => {
    await checkoutRoute.POST(new NextRequest("https://app.test/api/billing/whop/checkout", json({ planId: PLAN, cycle: "yearly" })))
    assert.equal(fakeDb().tables.whop_checkouts[0].whop_variant_id, "plan_ProYearly1")
    assert.equal(fakeDb().tables.whop_checkouts[0].interval, "year")
  })

  it("refuses unmapped plans, missing config and anonymous callers", async () => {
    fakeDb().tables.plans[0].whop_variant_id = null
    assert.equal((await checkoutRoute.POST(new NextRequest("https://app.test/x", json({ planId: PLAN })))).status, 409)
    const key = process.env.WHOP_API_KEY
    delete process.env.WHOP_API_KEY
    assert.equal((await checkoutRoute.POST(new NextRequest("https://app.test/x", json({ planId: LIFE })))).status, 503)
    process.env.WHOP_API_KEY = key
    as(null)
    assert.equal((await checkoutRoute.POST(new NextRequest("https://app.test/x", json({ planId: LIFE })))).status, 401)
  })
})
