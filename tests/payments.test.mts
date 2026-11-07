/**
 * Wallet / InstaPay plan payments, through the real route handlers against
 * the in-memory Supabase fake. The review SQL (idempotency, period
 * extension, RLS) is exercised on real Postgres in tests/db-migrations.test.mts.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import sharp from "sharp"

process.env.BYOK_ENCRYPTION_SECRET ||= "test-secret-for-token-sealing-0123456789"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const { signQuote, verifyQuote, checkoutTerms, validateSubmission, detectImageType, customerStatus } = await import("../lib/billing/manual-payments.ts")
const { paymentDestinations } = await import("../lib/billing/payment-methods.ts")
const manual = await import("../app/api/payments/manual/route.ts")
const adminList = await import("../app/api/admin/payments/route.ts")
const adminReview = await import("../app/api/admin/payments/[id]/route.ts")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const B = "bbbbbbbb-0000-0000-0000-00000000000b"
const ADMIN = "dddddddd-0000-0000-0000-00000000000d"
const PLAN = "99999999-0000-0000-0000-000000000001"

function seed() {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.storage = {}
  db.tables = {
    accounts: [
      { id: A, email: "a@test.local", role: "customer", plan: "trial", active_workspace_id: "wA" },
      { id: B, email: "b@test.local", role: "customer", plan: "trial", active_workspace_id: "wB" },
      { id: ADMIN, email: "admin@test.local", role: "admin", plan: "monthly", active_workspace_id: "wD" },
    ],
    workspaces: [
      { id: "wA", name: "A", owner_account_id: A, created_at: "2026-01-01" },
      { id: "wB", name: "B", owner_account_id: B, created_at: "2026-01-01" },
      { id: "wD", name: "D", owner_account_id: ADMIN, created_at: "2026-01-01" },
    ],
    workspace_members: [
      { workspace_id: "wA", account_id: A, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wB", account_id: B, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wD", account_id: ADMIN, role: "owner", created_at: "2026-01-01" },
    ],
    users: [
      { id: 1001, account_id: A, workspace_id: "wA", username: "a", access_token: null, created_at: "2026-01-01" },
      { id: 2002, account_id: B, workspace_id: "wB", username: "b", access_token: null, created_at: "2026-01-01" },
    ],
    plans: [{ id: PLAN, name: "Creator", price_usd: 29, price_egp: 1450, billing_cycle: "monthly", catalog_plan_id: "creator" }],
    payment_submissions: [],
    payment_events: [],
    notifications: [],
  }
  return db
}

const as = (id: string | null) => (fakeDb().authUserId = id)

function quoteFor(account: string, overrides: Record<string, unknown> = {}, ref = "CX-ABCDE2") {
  return signQuote({ v: 1, account, plan: PLAN, catalog: "creator", interval: "month", amountEgp: 1450, ref, exp: Date.now() + 3_600_000, ...overrides } as any)
}

async function png(withExif = false) {
  let img = sharp({ create: { width: 40, height: 30, channels: 3, background: "#e5a93c" } }).png()
  if (withExif) img = img.withMetadata({ exif: { IFD0: { Copyright: "secret-gps-like-data" } } })
  return new Uint8Array(await img.toBuffer())
}

async function submit(fields: Record<string, string | Blob | null>, headers: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) if (value !== null) form.set(key, value as any)
  return manual.POST(new NextRequest("https://app.test/api/payments/manual", { method: "POST", body: form, headers }))
}

async function validFields(account = A, ref = "CX-ABCDE2", txRef = "TX778899") {
  return {
    quote: quoteFor(account, {}, ref),
    method: "wallet",
    senderRef: "01012345678",
    amountPaid: "1450",
    transactionRef: txRef,
    transferredAt: new Date(Date.now() - 3_600_000).toISOString(),
    proof: new File([await png(true)], "receipt.png", { type: "image/png" }),
  }
}

const getMine = async () => (await manual.GET(new NextRequest("https://app.test/api/payments/manual"))).json()
const review = (id: string, body: unknown) =>
  adminReview.PATCH(
    new NextRequest(`https://app.test/api/admin/payments/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ id }) },
  )

describe("payment config and pure rules", () => {
  it("destinations come from env with the documented defaults", () => {
    const d = paymentDestinations({})
    assert.equal(d.wallet.local, "01007019031")
    assert.equal(d.wallet.international, "+201007019031")
    assert.equal(d.instapay.local, "01069647929")
    assert.equal(d.instapay.international, "+201069647929")
    assert.equal(paymentDestinations({ PAYMENT_WALLET_NUMBER: "+201111111111" }).wallet.local, "01111111111")
    assert.equal(paymentDestinations({ PAYMENT_WALLET_NUMBER: "not-a-number" }).wallet.local, "01007019031")
  })
  it("amount is decided on the server from EGP prices, and blocked without one", () => {
    const plan = { id: PLAN, name: "Creator", price_usd: 29, price_yearly: 290, price_egp: 1450, price_yearly_egp: 14500, billing_cycle: "monthly" }
    assert.deepEqual(checkoutTerms(plan, null, {}), { interval: "month", amountEgp: 1450, catalogPlanId: "creator" })
    assert.equal(checkoutTerms(plan, "yearly", {}).amountEgp, 14500)
    assert.equal(checkoutTerms({ ...plan, price_egp: null }, null, { PAYMENT_EGP_PER_USD: "50" }).amountEgp, 1450)
    assert.equal(checkoutTerms({ ...plan, price_egp: null }, null, {}).amountEgp, null)
  })
  it("quotes are bound to the account, unforgeable and expire", () => {
    const token = quoteFor(A)
    assert.ok(verifyQuote(token, A))
    assert.equal(verifyQuote(token, B), null, "another account's quote")
    const [body, mac] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), amountEgp: 1 })).toString("base64url")
    assert.equal(verifyQuote(`${forged}.${mac}`, A), null, "edited amount")
    assert.equal(verifyQuote(quoteFor(A, { exp: Date.now() - 1 }), A), null, "expired")
  })
  it("validates sender, amount, reference and time", () => {
    const base = { method: "instapay", senderRef: "ziad@instapay", amountPaid: "1,450", transactionRef: " ab 123 45 ", transferredAt: new Date().toISOString() }
    const ok = validateSubmission(base)
    assert.ok(ok.ok && ok.value.transactionRef === "AB12345" && ok.value.amountPaidEgp === 1450)
    assert.equal(validateSubmission({ ...base, method: "wallet", senderRef: "ziad@instapay" }).ok, false)
    assert.equal(validateSubmission({ ...base, method: "cash" }).ok, false)
    assert.equal(validateSubmission({ ...base, amountPaid: "-5" }).ok, false)
    assert.equal(validateSubmission({ ...base, transferredAt: new Date(Date.now() + 86_400_000).toISOString() }).ok, false)
  })
  it("detects image types from bytes, not names", () => {
    assert.equal(detectImageType(new TextEncoder().encode("<?php echo 1; ?>")), null)
    assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpg")
    assert.equal(customerStatus({ status: "pending" }), "under_review")
  })
})

describe("submitting proof", () => {
  beforeEach(() => {
    seed()
    as(A)
  })

  it("stores a pending payment with the quoted amount and a sanitized private proof", async () => {
    const fields = await validFields()
    const res = await submit({ ...fields, amountPaid: "1" })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.status, "under_review")
    const row = fakeDb().tables.payment_submissions[0]
    assert.equal(row.status, "pending")
    assert.equal(row.amount_egp, 1450, "expected amount comes from the signed quote")
    assert.equal(row.amount_paid_egp, 1, "what the customer typed is kept separately for the admin")
    assert.equal(row.account_id, A)
    assert.equal(row.reference_code, "CX-ABCDE2")
    assert.equal(row.proof_path, `${A}/${row.id}.png`)
    const stored = fakeDb().storage!["payment-proofs"][row.proof_path]
    assert.ok(stored, "proof uploaded to the private bucket under the owner's folder")
    const meta = await sharp(Buffer.from(stored.bytes)).metadata()
    assert.equal(meta.exif, undefined, "EXIF stripped")
    assert.equal(fakeDb().tables.notifications.filter((n) => n.account_id === ADMIN).length, 1, "admin notified")
    assert.doesNotMatch(JSON.stringify(fakeDb().tables.notifications), /01012345678|storage\.test/, "no phone or proof URL in notices")
    assert.equal(fakeDb().tables.accounts.find((a) => a.id === A)!.plan, "trial", "nothing is activated before review")
  })

  it("rejects a reused transaction reference", async () => {
    assert.equal((await submit(await validFields(A, "CX-ABCDE2", "TX1001"))).status, 201)
    const again = await submit(await validFields(A, "CX-ABCDE3", "tx 1001"))
    assert.equal(again.status, 409)
    assert.equal(fakeDb().tables.payment_submissions.length, 1)
  })

  it("rejects oversize and non-image uploads", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })
    assert.equal((await submit({ ...(await validFields()), proof: big })).status, 400)
    const script = new File(["<script>alert(1)</script>"], "receipt.png", { type: "image/png" })
    assert.equal((await submit({ ...(await validFields()), proof: script })).status, 400)
    const fakeJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6])], "x.jpg", { type: "image/jpeg" })
    assert.equal((await submit({ ...(await validFields()), proof: fakeJpeg })).status, 400)
    assert.equal((await submit({ ...(await validFields()), proof: null })).status, 400)
    assert.equal(fakeDb().tables.payment_submissions.length, 0)
    assert.equal(Object.keys(fakeDb().storage!["payment-proofs"] || {}).length, 0)
  })

  it("refuses another account's quote and edited quotes", async () => {
    assert.equal((await submit({ ...(await validFields()), quote: quoteFor(B) })).status, 400)
    assert.equal((await submit({ ...(await validFields()), quote: "garbage.token" })).status, 400)
  })

  it("rate limits submissions and caps pending payments", async () => {
    fakeDb().rpc = { take_inbound_rate_slot: () => ({ data: false, error: null }) }
    assert.equal((await submit(await validFields())).status, 429)
    fakeDb().rpc = {}
    for (const n of [1, 2, 3]) fakeDb().tables.payment_submissions.push({ id: `p${n}`, account_id: A, status: "pending", payment_method: "wallet", transaction_reference: `OLD${n}` })
    assert.equal((await submit(await validFields())).status, 429)
  })

  it("anon is blocked", async () => {
    as(null)
    assert.equal((await submit(await validFields())).status, 401)
    assert.equal((await manual.GET(new NextRequest("https://app.test/api/payments/manual"))).status, 401)
  })
})

describe("seeing payments and their status", () => {
  beforeEach(async () => {
    seed()
    as(A)
    await submit(await validFields())
  })

  it("user B cannot see user A's payments", async () => {
    as(B)
    assert.deepEqual((await getMine()).payments, [])
  })

  it("the status shown matches the database", async () => {
    const row = fakeDb().tables.payment_submissions[0]
    assert.equal((await getMine()).payments[0].status, "under_review")
    row.status = "rejected"
    row.admin_note = "Amount does not match"
    let mine = (await getMine()).payments[0]
    assert.equal(mine.status, "rejected")
    assert.equal(mine.reason, "Amount does not match")
    row.status = "approved"
    row.period_end = "2026-12-07T00:00:00Z"
    mine = (await getMine()).payments[0]
    assert.equal(mine.status, "approved")
    assert.equal(mine.periodEnd, "2026-12-07T00:00:00Z")
    assert.equal(mine.reason, null)
    assert.equal(JSON.stringify(mine).includes("proof"), false, "no screenshot path or URL in the customer view")
  })
})

describe("admin review", () => {
  beforeEach(async () => {
    seed()
    as(A)
    await submit(await validFields())
  })

  it("non-admins cannot list or review payments", async () => {
    const id = fakeDb().tables.payment_submissions[0].id
    as(B)
    assert.equal((await adminList.GET(new NextRequest("https://app.test/api/admin/payments"))).status, 403)
    assert.equal((await review(id, { action: "approve" })).status, 403)
    as(null)
    assert.equal((await review(id, { action: "approve" })).status, 401)
    assert.equal(fakeDb().tables.payment_submissions[0].status, "pending")
  })

  it("admin sees the proof through a short-lived signed URL", async () => {
    as(ADMIN)
    const res = await adminList.GET(new NextRequest("https://app.test/api/admin/payments"))
    const { payments } = await res.json()
    assert.equal(payments.length, 1)
    assert.match(payments[0].proof_url, /token=signed&expires=120$/)
    assert.equal(payments[0].accounts.email, "a@test.local")
  })

  it("approve goes through the atomic review function once; a repeat is a no-op", async () => {
    const id = fakeDb().tables.payment_submissions[0].id
    const calls: any[] = []
    fakeDb().rpc = {
      cyreax_review_payment: (args: any) => {
        calls.push(args)
        const row = fakeDb().tables.payment_submissions.find((r) => r.id === args.p_payment_id)!
        if (row.status !== "pending") return { data: { result: "already_reviewed", status: row.status }, error: null }
        row.status = "approved"
        return { data: { result: "approved", account_id: A, period_end: "2026-12-07T00:00:00Z" }, error: null }
      },
    }
    as(ADMIN)
    const first = await review(id, { action: "approve" })
    assert.equal((await first.json()).status, "approved")
    const second = await (await review(id, { action: "approve" })).json()
    assert.equal(second.alreadyReviewed, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].p_admin_account, ADMIN, "reviewer identity comes from the session")
    assert.equal(fakeDb().tables.notifications.filter((n) => n.account_id === A && n.title === "Payment approved").length, 1, "customer notified once")
  })

  it("reject requires a reason", async () => {
    as(ADMIN)
    const id = fakeDb().tables.payment_submissions[0].id
    assert.equal((await review(id, { action: "reject" })).status, 400)
  })
})
