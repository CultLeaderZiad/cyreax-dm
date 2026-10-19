import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { scopedAccountId } = await import("../lib/account-scope.ts")
const { safeAuthNext } = await import("../lib/auth-redirect.ts")
const { devWebhookSignatureBypass, whatsappVerifyTokenMatches } = await import("../lib/whatsapp/webhook-guard.ts")

const own = "account-own"
const agency = "account-agency"
const stranger = "account-stranger"

describe("agent account scope", () => {
  const memberships = [
    { ownerAccountId: agency, role: "member" as const },
    { ownerAccountId: "account-view-only", role: "client-viewer" as const },
  ]

  it("uses the signed-in account when the client omits accountId", () => {
    assert.equal(scopedAccountId(own, null, null, "GET"), own)
    assert.equal(scopedAccountId(own, undefined, null, "PATCH"), own)
    assert.equal(scopedAccountId(own, "   ", memberships, "PATCH"), own)
  })

  it("keeps the signed-in account when the client repeats it", () => {
    assert.equal(scopedAccountId(own, own, null, "PATCH"), own)
    assert.equal(scopedAccountId(own, `  ${own}  `, [], "GET"), own)
  })

  it("allows another account only through a real workspace membership", () => {
    assert.equal(scopedAccountId(own, agency, memberships, "GET"), agency)
    assert.equal(scopedAccountId(own, agency, memberships, "PATCH"), agency)
    assert.equal(scopedAccountId(own, "account-view-only", memberships, "GET"), "account-view-only")
  })

  it("refuses a foreign account with no membership, including legacy tables", () => {
    assert.equal(scopedAccountId(own, stranger, memberships, "GET"), null)
    assert.equal(scopedAccountId(own, stranger, [], "PATCH"), null)
    assert.equal(scopedAccountId(own, agency, null, "GET"), null)
    assert.equal(scopedAccountId("", agency, memberships, "GET"), null)
  })

  it("refuses viewers from writing another account's agent settings", () => {
    assert.equal(scopedAccountId(own, "account-view-only", memberships, "PATCH"), null)
  })
})

describe("auth callback next", () => {
  it("allows a single-slash in-app path", () => {
    assert.equal(safeAuthNext("/dashboard"), "/dashboard")
    assert.equal(safeAuthNext("/checkout/pro"), "/checkout/pro")
    assert.equal(safeAuthNext("/dashboard?tab=agents"), "/dashboard?tab=agents")
    assert.equal(safeAuthNext(null), "/dashboard")
    assert.equal(safeAuthNext(undefined), "/dashboard")
    assert.equal(safeAuthNext(""), "/dashboard")
  })

  it("falls back when next is not a single leading slash", () => {
    assert.equal(safeAuthNext("//evil.example"), "/dashboard")
    assert.equal(safeAuthNext("///evil.example"), "/dashboard")
    assert.equal(safeAuthNext("https://evil.example"), "/dashboard")
    assert.equal(safeAuthNext("\\\\evil.example"), "/dashboard")
    assert.equal(safeAuthNext("/\\evil.example"), "/dashboard")
    assert.equal(safeAuthNext("@evil.example"), "/dashboard")
  })
})

describe("whatsapp webhook guard", () => {
  it("allows the signature bypass only outside production", () => {
    assert.equal(
      devWebhookSignatureBypass({
        NODE_ENV: "development",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      true,
    )
    assert.equal(
      devWebhookSignatureBypass({
        NODE_ENV: "test",
        VERCEL_ENV: "preview",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      true,
    )
    assert.equal(
      devWebhookSignatureBypass({
        NODE_ENV: "production",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      false,
    )
    assert.equal(
      devWebhookSignatureBypass({
        NODE_ENV: "development",
        VERCEL_ENV: "production",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      false,
    )
    assert.equal(
      devWebhookSignatureBypass({
        NODE_ENV: "development",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "TRUE",
      }),
      false,
    )
    assert.equal(devWebhookSignatureBypass({ NODE_ENV: "development" }), false)
  })

  it("matches only the WhatsApp verify token, case-sensitively", () => {
    assert.equal(whatsappVerifyTokenMatches("expected-token", "expected-token"), true)
    assert.equal(whatsappVerifyTokenMatches("Expected-Token", "expected-token"), false)
    assert.equal(whatsappVerifyTokenMatches("expected-token", undefined), false)
    assert.equal(whatsappVerifyTokenMatches(null, "expected-token"), false)
    assert.equal(whatsappVerifyTokenMatches("", "expected-token"), false)
  })
})
