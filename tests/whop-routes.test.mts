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

const webhook = await import("../app/api/webhooks/whop/route.ts")

let seq = 0
function delivery(type: string, data: unknown, opts: { id?: string; secret?: string; ts?: number } = {}) {
  const id = opts.id || `msg_${++seq}`
  const ts = opts.ts ?? Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ id, type, api_version: "v1", data })
  const sig = "v1," + createHmac("sha256", Buffer.from(opts.secret || SECRET, "utf8")).update(`${id}.${ts}.${body}`).digest("base64")
  return new NextRequest("https://app.test/api/webhooks/whop", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig },
  })
}

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString()

/** A checkout A really started, and the membership Whop created for it. */
async function checkoutFor(account: string, planId = PLAN, cycle?: "yearly") {
  as(account)
  await checkoutRoute.POST(new NextRequest("https://app.test/x", json({ planId, cycle })))
  return fakeDb().tables.whop_checkouts.at(-1)!
}
function member(id: string, ref: string, account: string, variant: string, extra: Record<string, unknown> = {}) {
  memberships[id] = {
    id, status: "active", variant_id: variant, current_period_end: FUTURE, expires_at: null, cancel_at_period_end: false,
    metadata: { cyreax_ref: ref, cyreax_account_id: account, cyreax_plan_id: PLAN }, ...extra,
  }
  return memberships[id]
}
const billingOf = (account: string): any => fakeDb().tables.billing_accounts.find((r) => r.account_id === account)

describe("Whop webhook", () => {
  beforeEach(() => { seed(); stubWhop(); memberships = {}; payments = {} })
  afterEach(() => { globalThis.fetch = realFetch })

  it("rejects missing, wrong and stale signatures without touching billing", async () => {
    const bad = delivery("membership.activated", { id: "mem_x" }, { secret: "ws_wrong" })
    assert.equal((await webhook.POST(bad)).status, 401)
    const stale = delivery("membership.activated", { id: "mem_x" }, { ts: Math.floor(Date.now() / 1000) - 600 })
    assert.equal((await webhook.POST(stale)).status, 401)
    const none = new NextRequest("https://app.test/api/webhooks/whop", { method: "POST", body: "{}" })
    assert.equal((await webhook.POST(none)).status, 401)
    assert.equal(fakeDb().tables.billing_accounts.length, 0)
  })

  it("membership.activated grants exactly the bought plan with Whop's period end", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    const res = await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    assert.equal(res.status, 200)
    const b = billingOf(A)
    assert.equal(b.status, "active")
    assert.equal(b.plan_id, "agency_pro")
    assert.equal(b.display_plan_id, PLAN)
    assert.equal(b.interval, "month")
    assert.equal(b.current_period_end, FUTURE)
    assert.equal(b.payment_provider, "whop")
    assert.equal(b.provider_subscription_id, "mem_A1")
    assert.equal(fakeDb().tables.whop_checkouts[0].membership_id, "mem_A1")
  })

  it("is idempotent by webhook-id", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }, { id: "msg_same" }))
    const before = JSON.stringify(billingOf(A))
    memberships.mem_A1.status = "canceled" // would change state if processed again
    const again = await webhook.POST(delivery("membership.activated", { id: "mem_A1" }, { id: "msg_same" }))
    assert.equal((await again.json()).duplicate, true)
    assert.equal(JSON.stringify(billingOf(A)), before)
    assert.equal(fakeDb().tables.whop_webhook_events.length, 1)
  })

  it("payment.succeeded (renewal) moves the period end forward", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    const later = new Date(Date.now() + 60 * 86_400_000).toISOString()
    memberships.mem_A1.current_period_end = later
    await webhook.POST(delivery("payment.succeeded", { id: "pay_1", membership_id: "mem_A1", substatus: "succeeded" }))
    assert.equal(billingOf(A).current_period_end, later)
    assert.equal(billingOf(A).status, "active")
  })

  it("payment.failed reflects Whop's past_due state", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    memberships.mem_A1.status = "past_due"
    await webhook.POST(delivery("payment.failed", { id: "pay_2", membership_id: "mem_A1" }))
    assert.equal(billingOf(A).status, "past_due")
  })

  it("membership.updated: cancel at period end keeps access; canceled/expired end it", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    memberships.mem_A1.cancel_at_period_end = true
    await webhook.POST(delivery("membership.updated", { id: "mem_A1" }))
    assert.equal(billingOf(A).status, "active")
    assert.equal(billingOf(A).cancel_at_period_end, true)
    memberships.mem_A1.status = "canceled"
    await webhook.POST(delivery("membership.updated", { id: "mem_A1" }))
    assert.equal(billingOf(A).status, "canceled")
    memberships.mem_A1.status = "expired"
    await webhook.POST(delivery("membership.updated", { id: "mem_A1" }))
    assert.equal(billingOf(A).status, "expired")
  })

  it("a full refund ends access now", async () => {
    const co = await checkoutFor(A)
    member("mem_A1", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    payments.pay_9 = { id: "pay_9", membership_id: "mem_A1", substatus: "refunded" }
    await webhook.POST(delivery("refund.created", { id: "rf_1", payment: { id: "pay_9" } }))
    assert.equal(billingOf(A).status, "canceled")
    assert.ok(Date.parse(billingOf(A).current_period_end) <= Date.now())
  })

  it("lifetime is stored with the explicit marker and no end", async () => {
    const co = await checkoutFor(A, LIFE)
    member("mem_L1", co.ref, A, "plan_Life1", { current_period_end: null, metadata: { cyreax_ref: co.ref, cyreax_account_id: A, cyreax_plan_id: LIFE } })
    await webhook.POST(delivery("membership.activated", { id: "mem_L1" }))
    assert.equal(billingOf(A).interval, "lifetime")
    assert.equal(billingOf(A).current_period_end, null)
    assert.equal(billingOf(A).plan_id, "creator_plus")
  })

  it("forged cross-tenant metadata is rejected", async () => {
    const coA = await checkoutFor(A)
    // B's membership claims A's checkout ref but names B as the account.
    member("mem_B1", coA.ref, B, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_B1" }))
    assert.equal(billingOf(A), undefined)
    assert.equal(billingOf(B), undefined)
    // Metadata naming A with a ref we never issued.
    member("mem_B2", "00000000-0000-0000-0000-000000000000", A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_B2" }))
    assert.equal(billingOf(A), undefined)
    // A second membership reusing A's ref after the first claimed it.
    member("mem_A1", coA.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_A1" }))
    member("mem_A2", coA.ref, A, "plan_ProMonthly1")
    memberships.mem_A1.status = "active"
    await webhook.POST(delivery("membership.activated", { id: "mem_A2" }))
    assert.equal(billingOf(A).provider_subscription_id, "mem_A1")
  })

  it("never unlocks more than the purchased plan", async () => {
    const co = await checkoutFor(A, LIFE) // checked out the cheaper lifetime plan
    // ...but the membership is for the Pro variant (e.g. a swapped link).
    member("mem_X", co.ref, A, "plan_ProMonthly1")
    await webhook.POST(delivery("membership.activated", { id: "mem_X" }))
    assert.equal(billingOf(A), undefined)
    // Unknown variants grant nothing either.
    const co2 = await checkoutFor(A)
    member("mem_Y", co2.ref, A, "plan_NotOurs1")
    await webhook.POST(delivery("membership.activated", { id: "mem_Y" }))
    assert.equal(billingOf(A), undefined)
  })

  it("an old membership ending does not cancel a newer subscription", async () => {
    const co = await checkoutFor(A)
    member("mem_OLD", co.ref, A, "plan_ProMonthly1", { status: "expired" })
    fakeDb().tables.billing_accounts.push({ account_id: A, status: "active", payment_provider: "manual", provider_subscription_id: "pay-manual-1", current_period_end: FUTURE })
    await webhook.POST(delivery("membership.updated", { id: "mem_OLD" }))
    assert.equal(billingOf(A).status, "active")
    assert.equal(billingOf(A).payment_provider, "manual")
  })

  it("a Whop API failure returns 500 so Whop retries, and is not marked processed", async () => {
    const co = await checkoutFor(A)
    void co
    const res = await webhook.POST(delivery("membership.activated", { id: "mem_missing" }, { id: "msg_retry" }))
    assert.equal(res.status, 500)
    assert.equal(fakeDb().tables.whop_webhook_events.find((e) => e.webhook_id === "msg_retry")?.processed_at ?? null, null)
  })
})
