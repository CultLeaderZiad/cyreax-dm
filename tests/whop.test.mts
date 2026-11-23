import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createHmac } from "node:crypto"

const whop = await import("../lib/billing/whop.ts")
const { planForVariant, variantForPlan, billingFromMembership, isWhopVariantId, whopIdsError, verifyWhopWebhook, WhopSignatureError } = whop

const PLANS = [
  { id: "p-creator", catalog_plan_id: "creator", billing_cycle: "monthly", whop_variant_id: "plan_CreatorMo1", whop_variant_id_yearly: "plan_CreatorYr1" },
  { id: "p-life", catalog_plan_id: "agency_pro", billing_cycle: "lifetime", whop_variant_id: "plan_Lifetime1", whop_variant_id_yearly: null },
  { id: "p-none", catalog_plan_id: "agency", billing_cycle: "monthly", whop_variant_id: null, whop_variant_id_yearly: null },
]

describe("Whop plan mapping", () => {
  it("maps each Whop variant to exactly one of our plans and interval", () => {
    assert.deepEqual(planForVariant(PLANS, "plan_CreatorMo1")?.interval, "month")
    assert.equal(planForVariant(PLANS, "plan_CreatorMo1")?.plan.id, "p-creator")
    assert.deepEqual(planForVariant(PLANS, "plan_CreatorYr1")?.interval, "year")
    assert.deepEqual(planForVariant(PLANS, "plan_Lifetime1")?.interval, "lifetime")
    assert.equal(planForVariant(PLANS, "plan_Unknown99"), null, "unknown variants grant nothing")
  })

  it("sells the right variant for a cycle, and nothing when unmapped", () => {
    assert.deepEqual(variantForPlan(PLANS[0], undefined), { variantId: "plan_CreatorMo1", interval: "month" })
    assert.deepEqual(variantForPlan(PLANS[0], "yearly"), { variantId: "plan_CreatorYr1", interval: "year" })
    assert.deepEqual(variantForPlan(PLANS[1], "yearly"), { variantId: "plan_Lifetime1", interval: "lifetime" })
    assert.equal(variantForPlan(PLANS[2], undefined), null)
  })

  it("validates admin input", () => {
    assert.equal(isWhopVariantId("plan_AbC123"), true)
    assert.equal(isWhopVariantId("prod_AbC123"), false)
    assert.equal(whopIdsError({ whop_variant_id: "" }), null)
    assert.match(whopIdsError({ whop_variant_id: "https://whop.com/x" }) || "", /plan_/)
  })
})

describe("Whop membership -> billing", () => {
  const end = "2026-12-23T00:00:00Z"
  const m = (status: string, extra: Record<string, unknown> = {}) => ({ status, current_period_end: end, expires_at: null, cancel_at_period_end: false, ...extra })

  it("only active/trialing grant access", () => {
    assert.equal(billingFromMembership(m("active"), "month").status, "active")
    assert.equal(billingFromMembership(m("trialing"), "month").status, "trialing")
    assert.equal(billingFromMembership(m("past_due"), "month").status, "past_due")
    assert.equal(billingFromMembership(m("canceled"), "month").status, "canceled")
    for (const s of ["completed", "expired", "something_new"]) assert.equal(billingFromMembership(m(s), "month").status, "expired")
  })

  it("keeps the period end for renewing plans and none for lifetime", () => {
    assert.equal(billingFromMembership(m("active"), "month").currentPeriodEnd, end)
    assert.equal(billingFromMembership(m("active"), "lifetime").currentPeriodEnd, null)
    assert.equal(billingFromMembership(m("active", { current_period_end: null, expires_at: end }), "year").currentPeriodEnd, end)
    assert.equal(billingFromMembership(m("active", { cancel_at_period_end: true }), "month").cancelAtPeriodEnd, true)
  })
})

/** Signs like Whop's backend: HMAC-SHA256 over id.timestamp.body keyed with the secret's literal bytes. */
export function signWhop(secret: string, id: string, ts: number, body: string) {
  return "v1," + createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${ts}.${body}`).digest("base64")
}

describe("Whop webhook signatures", () => {
  const secret = "ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  const body = JSON.stringify({ id: "msg_1", type: "membership.activated", data: { id: "mem_1" } })
  const now = 1_790_000_000
  const headers = (sig: string, ts = now, id = "msg_1") => new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig })

  it("accepts a valid signature, including one of several", () => {
    assert.equal(verifyWhopWebhook(body, headers(signWhop(secret, "msg_1", now, body)), secret, now).type, "membership.activated")
    assert.equal(verifyWhopWebhook(body, headers(`v1,AAAA ${signWhop(secret, "msg_1", now, body)}`), secret, now).type, "membership.activated")
  })

  it("rejects wrong secrets, tampered bodies, other ids, stale timestamps and missing headers", () => {
    const good = signWhop(secret, "msg_1", now, body)
    assert.throws(() => verifyWhopWebhook(body, headers(signWhop("ws_other", "msg_1", now, body)), secret, now), WhopSignatureError)
    assert.throws(() => verifyWhopWebhook(body.replace("mem_1", "mem_2"), headers(good), secret, now), WhopSignatureError)
    assert.throws(() => verifyWhopWebhook(body, headers(good, now, "msg_2"), secret, now), WhopSignatureError)
    assert.throws(() => verifyWhopWebhook(body, headers(signWhop(secret, "msg_1", now - 301, body), now - 301), secret, now), WhopSignatureError)
    assert.throws(() => verifyWhopWebhook(body, new Headers(), secret, now), WhopSignatureError)
    assert.throws(() => verifyWhopWebhook(body, headers("v2," + good.slice(3)), secret, now), WhopSignatureError)
  })
})
