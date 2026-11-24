import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { syncWhopPrices, usablePrice, SYNC_TTL_MS } = await import("../lib/billing/whop-price-sync.ts")

const NOW = Date.parse("2026-11-28T12:00:00Z")
const ID_M = "plan_IBbNH8TGcs1np"
const ID_Y = "plan_CeX9JWzui6yd7"
const info = (price: number | null, currency: string | null = "USD") => ({ id: "x", title: "t", price, currency, billingPeriodDays: 30, visibility: null })

function seed(extra: Record<string, unknown> = {}) {
  const db = fakeDb()
  db.rpc = {}
  db.tables = { plans: [{ id: "p1", name: "Starter", price_usd: 19.99, price_yearly: null, whop_variant_id: ID_M, whop_variant_id_yearly: null, whop_synced_at: null, ...extra }] }
}
const run = async (fetchPlan: any, opts: any = {}) => syncWhopPrices(await getSupabaseBypassClient(), { apiKey: "k", now: NOW, fetchPlan, ...opts })

describe("prices follow Whop", () => {
  beforeEach(() => seed())

  it("copies a changed USD price and stamps the sync time", async () => {
    const r = await run(async () => info(24.99))
    assert.equal(fakeDb().tables.plans[0].price_usd, 24.99)
    assert.equal(fakeDb().tables.plans[0].whop_synced_at, new Date(NOW).toISOString())
    assert.deepEqual(r.updated.map((u: any) => [u.field, u.from, u.to]), [["price_usd", 19.99, 24.99]])
  })

  it("syncs the yearly price from the yearly Whop plan", async () => {
    seed({ whop_variant_id_yearly: ID_Y, price_yearly: 100 })
    await run(async (id: string) => info(id === ID_Y ? 199.9 : 19.99))
    assert.equal(fakeDb().tables.plans[0].price_yearly, 199.9)
    assert.equal(fakeDb().tables.plans[0].price_usd, 19.99)
  })

  it("ignores non-USD, zero, absurd and failed answers", async () => {
    for (const bad of [info(30, "EUR"), info(0), info(9_999_999), info(null)]) {
      seed()
      await run(async () => bad)
      assert.equal(fakeDb().tables.plans[0].price_usd, 19.99)
      assert.equal(fakeDb().tables.plans[0].whop_synced_at, null) // retried next time
    }
    seed()
    const r = await run(async () => { throw new Error("503") })
    assert.equal(r.errors, 1)
    assert.equal(fakeDb().tables.plans[0].price_usd, 19.99)
  })

  it("does not call Whop again inside the TTL unless forced", async () => {
    seed({ whop_synced_at: new Date(NOW - SYNC_TTL_MS + 60_000).toISOString() })
    let calls = 0
    await run(async () => { calls++; return info(30) })
    assert.equal(calls, 0)
    await run(async () => { calls++; return info(30) }, { force: true })
    assert.equal(calls, 1)
    assert.equal(fakeDb().tables.plans[0].price_usd, 30)
  })

  it("leaves plans without a Whop id alone, and does nothing without an API key", async () => {
    seed({ whop_variant_id: null })
    let calls = 0
    await run(async () => { calls++; return info(50) })
    assert.equal(calls, 0)
    seed()
    const r = await syncWhopPrices(await getSupabaseBypassClient(), { apiKey: "", now: NOW, fetchPlan: async () => { calls++; return info(50) } })
    assert.equal(r.checked, 0)
    assert.equal(fakeDb().tables.plans[0].price_usd, 19.99)
  })

  it("usablePrice rounds to cents", () => {
    assert.equal(usablePrice(info(19.994)), 19.99)
  })
})
