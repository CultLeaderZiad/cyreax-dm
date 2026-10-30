import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { safeAuthNext } = await import("../lib/auth-redirect.ts")
const { devWebhookSignatureBypass } = await import("../lib/webhooks/signature-guard.ts")
const { devWebhookSignatureBypass: whatsappSignatureBypass } = await import("../lib/whatsapp/webhook-guard.ts")

describe("auth callback next", () => {
  it("allows a single-slash in-app path", () => {
    assert.equal(safeAuthNext("/dashboard"), "/dashboard")
    assert.equal(safeAuthNext("/checkout/pro"), "/checkout/pro")
    assert.equal(safeAuthNext("/dashboard?tab=agents"), "/dashboard?tab=agents")
    assert.equal(safeAuthNext("/dashboard/inbox?x=1"), "/dashboard/inbox?x=1")
    assert.equal(safeAuthNext(null), "/dashboard")
    assert.equal(safeAuthNext(undefined), "/dashboard")
    assert.equal(safeAuthNext(""), "/dashboard")
  })

  it("falls back when next is not a single leading slash or is malicious", () => {
    assert.equal(safeAuthNext("//evil.com"), "/dashboard")
    assert.equal(safeAuthNext("/\\evil.com"), "/dashboard")
    assert.equal(safeAuthNext("/\t/evil.com"), "/dashboard")
    assert.equal(safeAuthNext("@evil.com"), "/dashboard")
    assert.equal(safeAuthNext(".evil.com"), "/dashboard")
    assert.equal(safeAuthNext("https://evil.com"), "/dashboard")
    assert.equal(safeAuthNext("/%2F%2Fevil.com"), "/dashboard")
  })
})

describe("webhook signature guard", () => {
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

  it("re-exports devWebhookSignatureBypass from whatsapp guard path correctly", () => {
    assert.equal(
      whatsappSignatureBypass({
        VERCEL_ENV: "production",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      false,
    )
    assert.equal(
      whatsappSignatureBypass({
        NODE_ENV: "development",
        DISABLE_WEBHOOK_SIGNATURE_CHECK: "true",
      }),
      true,
    )
  })
})
