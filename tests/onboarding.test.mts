/**
 * Customer onboarding: validation, who owes the form, the customer's own
 * endpoint, and what the admin sees. The Telegram token must never be readable
 * by anything but the admin "reveal" call.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

process.env.BYOK_ENCRYPTION_SECRET = process.env.BYOK_ENCRYPTION_SECRET || "test-secret-0123456789abcdef0123456789abcdef"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { NextRequest } = await import("next/server")
const { parseOnboarding, onboardingRequired, maskToken } = await import("../lib/onboarding.ts")
const mine = await import("../app/api/onboarding/route.ts")
const adminList = await import("../app/api/admin/onboarding/route.ts")
const adminOne = await import("../app/api/admin/onboarding/[accountId]/route.ts")
const adminReveal = await import("../app/api/admin/onboarding/[accountId]/reveal/route.ts")
const adminCount = await import("../app/api/admin/onboarding/count/route.ts")

const ADMIN = "aaaaaaaa-0000-0000-0000-00000000000a"
const USER = "bbbbbbbb-0000-0000-0000-00000000000b"
const OTHER = "cccccccc-0000-0000-0000-00000000000c"
const TOKEN = "123456789:" + "AbC_dEf-".repeat(5).slice(0, 35)

function seed() {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.authUserId = USER
  const now = new Date().toISOString()
  db.tables = {
    accounts: [
      { id: ADMIN, email: "admin@test.local", role: "admin", plan: "monthly", active_workspace_id: "wA", created_at: now },
      { id: USER, email: "user@test.local", role: "customer", plan: "trial", active_workspace_id: "wB", created_at: now },
      { id: OTHER, email: "other@test.local", role: "customer", plan: "trial", active_workspace_id: "wC", created_at: now },
    ],
    workspaces: [
      { id: "wA", name: "A", owner_account_id: ADMIN, created_at: "2026-01-01" },
      { id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" },
      { id: "wC", name: "C", owner_account_id: OTHER, created_at: "2026-01-01" },
    ],
    workspace_members: [
      { workspace_id: "wA", account_id: ADMIN, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" },
      { workspace_id: "wC", account_id: OTHER, role: "owner", created_at: "2026-01-01" },
    ],
    users: [
      { id: 1, account_id: ADMIN, workspace_id: "wA", username: "admin", access_token: "workspace_managed" },
      { id: 2, account_id: USER, workspace_id: "wB", username: "user", access_token: "workspace_managed" },
      { id: 3, account_id: OTHER, workspace_id: "wC", username: "other", access_token: "workspace_managed" },
    ],
    account_onboarding: [],
    platform_connections: [],
  }
}
const as = (id: string) => { fakeDb().authUserId = id }
const put = (body: unknown) => mine.PUT(new NextRequest("https://app.test/api/onboarding", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }))
const form = { fullName: "Sara Ali", company: "Sara Shop", instagramUsername: "@sara.shop", facebookId: "105298374612345", telegramBotToken: TOKEN }
const ctx = (id: string) => ({ params: Promise.resolve({ accountId: id }) })
const req = (body?: unknown) => new NextRequest("https://app.test/x", { method: "PATCH", body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } })

describe("onboarding validation", () => {
  it("accepts a full form and cleans it", () => {
    const r = parseOnboarding(form)
    assert.ok(r.ok)
    if (r.ok) assert.deepEqual([r.value.instagramUsername, r.value.facebookId, r.value.company], ["sara.shop", "105298374612345", "Sara Shop"])
  })
  it("needs a name and at least one channel", () => {
    const r = parseOnboarding({ fullName: "S", company: "" })
    assert.ok(!r.ok)
    if (!r.ok) assert.ok(r.errors.fullName && r.errors.channels)
    assert.ok(parseOnboarding({ fullName: "Sara", telegramBotToken: TOKEN }).ok)
  })
  it("rejects malformed channel details with a clear message", () => {
    const r = parseOnboarding({ fullName: "Sara", instagramUsername: "not a user!", facebookId: "mypage", telegramBotToken: "abc" })
    assert.ok(!r.ok)
    if (!r.ok) assert.ok(r.errors.instagramUsername && r.errors.facebookId && r.errors.telegramBotToken)
  })
  it("masks a token", () => assert.equal(maskToken(TOKEN), "123456789:••••••••"))
})

describe("who owes the form", () => {
  beforeEach(seed)
  it("a new customer does; admins, team members, submitters and already-connected customers do not", async () => {
    const db = await getSupabaseBypassClient()
    assert.equal(await onboardingRequired(db, { id: USER, role: "customer" }), true)
    assert.equal(await onboardingRequired(db, { id: ADMIN, role: "admin" }), false)
    assert.equal(await onboardingRequired(db, { id: USER, role: "customer", is_team_member: true }), false)
    fakeDb().tables.users[1].access_token = "real-token"
    assert.equal(await onboardingRequired(db, { id: USER, role: "customer" }), false)
    fakeDb().tables.users[1].access_token = "workspace_managed"
    fakeDb().tables.platform_connections.push({ id: 1, account_id: USER })
    assert.equal(await onboardingRequired(db, { id: USER, role: "customer" }), false)
    fakeDb().tables.platform_connections = []
    fakeDb().tables.account_onboarding.push({ account_id: USER, full_name: "x", status: "submitted" })
    assert.equal(await onboardingRequired(db, { id: USER, role: "customer" }), false)
  })
})

describe("the customer's own onboarding", () => {
  beforeEach(seed)

  it("saves the details, seals the Telegram token and never returns it", async () => {
    assert.equal((await put(form)).status, 200)
    const row = fakeDb().tables.account_onboarding[0]
    assert.equal(row.account_id, USER)
    assert.equal(row.status, "submitted")
    assert.ok(row.telegram_bot_token.startsWith("enc:v1:"), "stored sealed")
    assert.ok(!JSON.stringify(row).includes(TOKEN))
    const body = await (await mine.GET(new NextRequest("https://app.test/api/onboarding"))).json()
    assert.equal(body.submitted, true)
    assert.equal(body.values.telegramBotToken, "123456789:••••••••")
    assert.ok(!JSON.stringify(body).includes(TOKEN))
  })

  it("rejects an invalid form with per-field errors and saves nothing", async () => {
    const res = await put({ fullName: "S", telegramBotToken: "zzz" })
    assert.equal(res.status, 400)
    assert.ok((await res.json()).errors.telegramBotToken)
    assert.equal(fakeDb().tables.account_onboarding.length, 0)
  })

  it("editing keeps the stored token when the masked value is sent back, and resets the status", async () => {
    await put(form)
    fakeDb().tables.account_onboarding[0].status = "link_sent"
    const before = fakeDb().tables.account_onboarding[0].telegram_bot_token
    assert.equal((await put({ ...form, company: "New name", telegramBotToken: "123456789:••••••••" })).status, 200)
    const row = fakeDb().tables.account_onboarding[0]
    assert.equal(row.telegram_bot_token, before)
    assert.equal(row.company, "New name")
    assert.equal(row.status, "submitted")
  })

  it("once connected the customer cannot change it", async () => {
    await put(form)
    fakeDb().tables.account_onboarding[0].status = "connected"
    assert.equal((await put({ ...form, company: "Hijack" })).status, 409)
  })

  it("a customer only ever reads and writes their own row", async () => {
    await put(form)
    as(OTHER)
    assert.equal((await (await mine.GET(new NextRequest("https://app.test/api/onboarding"))).json()).submitted, false)
  })
})

describe("what the admin sees", () => {
  beforeEach(seed)

  it("lists submissions and recent signups that have not sent the form", async () => {
    await put(form)
    as(ADMIN)
    const body = await (await adminList.GET()).json()
    const byAccount = Object.fromEntries(body.items.map((i: any) => [i.accountId, i]))
    assert.equal(byAccount[USER].state, "submitted")
    assert.equal(byAccount[USER].instagramUsername, "sara.shop")
    assert.equal(byAccount[USER].telegramToken, "123456789:••••••••")
    assert.equal(byAccount[OTHER].state, "awaiting_form")
    assert.ok(!JSON.stringify(body).includes(TOKEN))
    assert.ok(body.attention >= 2)
    assert.ok((await (await adminCount.GET()).json()).count >= 2)
  })

  it("only an admin can list, update or reveal", async () => {
    await put(form)
    assert.equal((await adminList.GET()).status, 403)
    assert.equal((await adminOne.PATCH(req({ status: "connected" }), ctx(USER))).status, 403)
    assert.equal((await adminReveal.POST(req(), ctx(USER))).status, 403)
    assert.equal((await adminCount.GET()).status, 403)
  })

  it("the admin moves the status, leaves a message and can reveal the token", async () => {
    await put(form)
    as(ADMIN)
    assert.equal((await adminOne.PATCH(req({ status: "link_sent", note: "Accept the invite on Instagram" }), ctx(USER))).status, 200)
    const row = fakeDb().tables.account_onboarding[0]
    assert.equal(row.status, "link_sent")
    assert.equal(row.admin_note, "Accept the invite on Instagram")
    assert.equal((await adminOne.PATCH(req({ status: "hacked" }), ctx(USER))).status, 400)
    const revealed = await (await adminReveal.POST(req(), ctx(USER))).json()
    assert.equal(revealed.token, TOKEN)
    assert.equal((await adminOne.PATCH(req({ seen: true }), ctx(USER))).status, 200)
    assert.ok(fakeDb().tables.account_onboarding[0].admin_seen_at)
  })
})
