/**
 * Route-level tenant isolation. Runs the real route handlers and the real
 * session/workspace resolution (lib/auth.ts) against an in-memory Supabase
 * fake (tests/fakes/supabase-server.ts, swapped in by tests/register-fake-db.mjs).
 * Not a substitute for testing RLS in the live database.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const B = "bbbbbbbb-0000-0000-0000-00000000000b"

function seed() {
  const db = fakeDb()
  db.tables = {
    accounts: [
      { id: A, email: "a@test.local", role: "customer", plan: "pro", active_workspace_id: "wA" },
      { id: B, email: "b@test.local", role: "customer", plan: "pro", active_workspace_id: "wB" },
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
      { id: 1001, account_id: A, workspace_id: "wA", username: "a", access_token: null, created_at: "2026-01-01" },
      { id: 2002, account_id: B, workspace_id: "wB", username: "b", access_token: null, created_at: "2026-01-01" },
    ],
    contacts: [
      { id: "cA", user_id: 1001, workspace_id: "wA", channel: "instagram", external_id: "ig-a", display_name: "Alice (A's customer)", tags: [], last_seen_at: "2026-02-01" },
      { id: "cB", user_id: 2002, workspace_id: "wB", channel: "instagram", external_id: "ig-b", display_name: "Bob", tags: [], last_seen_at: "2026-02-01" },
    ],
    automations: [{ id: "autoA", user_id: 1001, name: "A promo", is_active: true }],
    conversations: [{ id: "convA", user_id: 1001, platform: "instagram", recipient_id: "ig-a" }],
    messages: [{ id: "mA", conversation_id: "convA", user_id: 1001, content: "A private message" }],
    platform_connections: [
      { id: "connA", user_id: 1001, account_id: A, workspace_id: "wA", platform: "tiktok", page_id: "tt-a", access_token: "x", metadata: {} },
    ],
    broadcasts: [{ id: "bcA", user_id: 1001, name: "A campaign" }],
    flows: [{ id: "flowA", user_id: 1001, name: "A flow", status: "draft" }],
  }
  return db
}

function as(user: string | null) {
  fakeDb().authUserId = user
}

const req = (url: string, init?: RequestInit) => new NextRequest(`https://app.test${url}`, init as any)
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } })

const contacts = await import("../app/api/contacts/route.ts")
const contactById = await import("../app/api/contacts/[id]/route.ts")
const contactsExport = await import("../app/api/contacts/export/route.ts")
const automations = await import("../app/api/automations/route.ts")
const inboxMessages = await import("../app/api/inbox/messages/route.ts")
const connections = await import("../app/api/user/connections/route.ts")
const broadcastById = await import("../app/api/broadcasts/[id]/route.ts")
const flowById = await import("../app/api/flows/[id]/route.ts")

describe("user B cannot touch user A's data", () => {
  beforeEach(() => {
    seed()
    as(B)
  })

  it("contacts list only returns B's contacts", async () => {
    const res = await contacts.GET(req("/api/contacts"))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body.contacts.map((c: any) => c.id), ["cB"])
  })

  it("contacts export (CSV) never includes A's contacts", async () => {
    const res = await contactsExport.GET(req("/api/contacts/export"))
    assert.equal(res.status, 200)
    const csv = await res.text()
    assert.doesNotMatch(csv, /Alice|ig-a/)
  })

  it("cannot update A's contact", async () => {
    const res = await contactById.PATCH(req("/api/contacts/cA", json({ display_name: "pwned" }, "PATCH")), { params: Promise.resolve({ id: "cA" }) })
    assert.equal(res.status, 404)
    assert.equal(fakeDb().tables.contacts.find((c) => c.id === "cA")!.display_name, "Alice (A's customer)")
  })

  it("cannot delete or toggle A's automation", async () => {
    const del = await automations.DELETE(req("/api/automations?id=autoA", { method: "DELETE" }))
    assert.equal(del.status, 404)
    const toggle = await automations.PATCH(req("/api/automations", json({ id: "autoA", is_active: false }, "PATCH")))
    assert.notEqual(toggle.status, 200)
    const row = fakeDb().tables.automations.find((a) => a.id === "autoA")
    assert.ok(row)
    assert.equal(row!.is_active, true)
  })

  it("cannot duplicate (read) A's automation", async () => {
    const res = await automations.PATCH(req("/api/automations", json({ id: "autoA", action: "duplicate" }, "PATCH")))
    assert.equal(res.status, 404)
    assert.equal(fakeDb().tables.automations.length, 1)
  })

  it("cannot read A's conversation messages", async () => {
    const res = await inboxMessages.GET(req("/api/inbox/messages?conversationId=convA"))
    assert.equal(res.status, 404)
    assert.doesNotMatch(await res.text(), /A private message/)
  })

  it("cannot disconnect A's integration", async () => {
    const res = await connections.DELETE(req("/api/user/connections?id=connA", { method: "DELETE" }))
    assert.equal(res.status, 404)
    assert.equal(fakeDb().tables.platform_connections.length, 1)
  })

  it("cannot read A's broadcast campaign", async () => {
    const res = await broadcastById.GET(req("/api/broadcasts/bcA"), { params: Promise.resolve({ id: "bcA" }) })
    assert.notEqual(res.status, 200)
  })

  it("cannot read, update or delete A's flow", async () => {
    const ctx = { params: Promise.resolve({ id: "flowA" }) }
    const get = await flowById.GET(req("/api/flows/flowA"), ctx)
    assert.notEqual(get.status, 200)
    await flowById.PATCH(req("/api/flows/flowA", json({ name: "pwned" }, "PATCH")), { params: Promise.resolve({ id: "flowA" }) })
    await flowById.DELETE(req("/api/flows/flowA", { method: "DELETE" }), { params: Promise.resolve({ id: "flowA" }) })
    const flow = fakeDb().tables.flows.find((f) => f.id === "flowA")
    assert.ok(flow, "flow must still exist")
    assert.equal(flow!.name, "A flow")
  })

  it("naming A's workspace in the header is refused", async () => {
    const res = await contacts.GET(req("/api/contacts", { headers: { "x-cyreax-workspace": "wA" } }))
    assert.equal(res.status, 403)
  })
})

describe("the owner still sees their own data (sanity)", () => {
  beforeEach(() => {
    seed()
    as(A)
  })
  it("A can update A's contact", async () => {
    const res = await contactById.PATCH(req("/api/contacts/cA", json({ display_name: "Alice 2" }, "PATCH")), { params: Promise.resolve({ id: "cA" }) })
    assert.equal(res.status, 200)
  })
  it("A can read A's messages", async () => {
    const res = await inboxMessages.GET(req("/api/inbox/messages?conversationId=convA"))
    assert.equal(res.status, 200)
  })
})

describe("anonymous callers are denied", () => {
  beforeEach(() => {
    seed()
    as(null)
  })
  it("every tenant route returns 401", async () => {
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
    const responses = [
      await contacts.GET(req("/api/contacts")),
      await contactsExport.GET(req("/api/contacts/export")),
      await contactById.PATCH(req("/api/contacts/cA", json({ display_name: "x" }, "PATCH")), ctx("cA")),
      await automations.DELETE(req("/api/automations?id=autoA", { method: "DELETE" })),
      await inboxMessages.GET(req("/api/inbox/messages?conversationId=convA")),
      await connections.DELETE(req("/api/user/connections?id=connA", { method: "DELETE" })),
      await broadcastById.GET(req("/api/broadcasts/bcA"), ctx("bcA")),
      await flowById.GET(req("/api/flows/flowA"), ctx("flowA")),
    ]
    assert.deepEqual(responses.map((r) => r.status), responses.map(() => 401))
  })
})
