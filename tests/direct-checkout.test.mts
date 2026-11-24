/**
 * Choosing a plan goes straight to the hosted payment page: the checkout is
 * created on the server for the signed-in account and plan, and nothing is
 * granted until the signed payment event arrives.
 */
import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

process.env.WHOP_API_KEY = "test-key"
process.env.WHOP_WEBHOOK_SECRET = "ws_test_0123456789abcdef0123456789abcdef"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { createCardCheckout } = await import("../lib/billing/whop-checkout.ts")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const PLAN = "99999999-0000-0000-0000-000000000001"
const realFetch = globalThis.fetch
let calls: Array<{ url: string; body: any }> = []

beforeEach(() => {
  const db = fakeDb()
  db.rpc = {}
  db.tables = {
    plans: [
      { id: PLAN, catalog_plan_id: "creator_plus", billing_cycle: "monthly", whop_variant_id: "plan_JtjPwHcMVU9lU", whop_variant_id_yearly: null, is_active: true, is_contact_sales: false },
      { id: "99999999-0000-0000-0000-000000000002", catalog_plan_id: "agency", billing_cycle: "monthly", whop_variant_id: null, whop_variant_id_yearly: null, is_active: true, is_contact_sales: false },
      { id: "99999999-0000-0000-0000-000000000003", catalog_plan_id: "creator", billing_cycle: "monthly", whop_variant_id: "plan_IBbNH8TGcs1np", whop_variant_id_yearly: null, is_active: false, is_contact_sales: false },
    ],
    whop_checkouts: [],
  }
  calls = []
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
    return new Response(JSON.stringify({ id: "ch_test1", purchase_url: "https://whop.com/checkout/ch_test1" }), { status: 200 })
  }) as any
})
afterEach(() => { globalThis.fetch = realFetch })

describe("direct card checkout", () => {
  it("returns the payment page for the account and plan, redirecting back to the dashboard confirmation", async () => {
    const db = await getSupabaseBypassClient()
    const r = await createCardCheckout(db, { accountId: A, planId: PLAN, origin: "https://app.test/" })
    assert.deepEqual(r, { ok: true, url: "https://whop.com/checkout/ch_test1" })
    const sent = calls.find((c) => c.url.endsWith("/checkout_configurations"))!.body
    assert.equal(sent.variant_id, "plan_JtjPwHcMVU9lU")
    assert.equal(sent.redirect_url, "https://app.test/dashboard/billing?checkout=whop")
    assert.equal(sent.metadata.cyreax_account_id, A)
    const row = fakeDb().tables.whop_checkouts[0]
    assert.equal(row.account_id, A)
    assert.equal(row.plan_id, PLAN)
    assert.equal(sent.metadata.cyreax_ref, row.ref)
  })

  it("never reaches the provider for an unknown, inactive or card-less plan", async () => {
    const db = await getSupabaseBypassClient()
    for (const planId of ["not-a-uuid", "99999999-0000-0000-0000-0000000000ff", "99999999-0000-0000-0000-000000000003", "99999999-0000-0000-0000-000000000002"]) {
      const r = await createCardCheckout(db, { accountId: A, planId, origin: "https://app.test" })
      assert.equal(r.ok, false, planId)
    }
    assert.equal(calls.length, 0)
    assert.equal(fakeDb().tables.whop_checkouts.length, 0)
  })

  it("reports a provider failure instead of throwing", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as any
    const db = await getSupabaseBypassClient()
    const r = await createCardCheckout(db, { accountId: A, planId: PLAN, origin: "https://app.test" })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.status, 502)
  })
})
