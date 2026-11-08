import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const list = await import("../app/api/support/tickets/route.ts")
const one = await import("../app/api/support/tickets/[id]/route.ts")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const B = "bbbbbbbb-0000-0000-0000-00000000000b"
const ADMIN = "dddddddd-0000-0000-0000-00000000000d"

function seed() {
  const db = fakeDb()
  db.rpc = {}
  db.tables = {
    accounts: [
      { id: A, email: "a@test.local", role: "customer", active_workspace_id: "wA" },
      { id: B, email: "b@test.local", role: "customer", active_workspace_id: "wB" },
      { id: ADMIN, email: "admin@test.local", role: "admin", active_workspace_id: "wD" },
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
    support_tickets: [],
    support_messages: [],
    notifications: [],
  }
}
const as = (id: string | null) => (fakeDb().authUserId = id)
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function openTicketAsA() {
  as(A)
  const res = await list.POST(new NextRequest("https://app.test/api/support/tickets", json({ subject: "Inbox is empty", category: "bug", body: "<b>help</b>" })))
  assert.equal(res.status, 201)
  return (await res.json()).id as string
}

describe("support tickets", () => {
  beforeEach(seed)

  it("customer opens a ticket; admins are notified", async () => {
    const id = await openTicketAsA()
    assert.equal(fakeDb().tables.support_messages[0].author_role, "customer")
    assert.ok(fakeDb().tables.notifications.some((n) => n.account_id === ADMIN && n.link.includes(id)))
  })

  it("user B can't list, read, reply to or close A's ticket", async () => {
    const id = await openTicketAsA()
    as(B)
    assert.deepEqual((await (await list.GET(new NextRequest("https://app.test/api/support/tickets?all=1"))).json()).tickets, [])
    assert.equal((await one.GET(new NextRequest(`https://app.test/api/support/tickets/${id}`), ctx(id))).status, 404)
    assert.equal((await one.POST(new NextRequest(`https://app.test/x`, json({ body: "hi" })), ctx(id))).status, 404)
    assert.equal((await one.PATCH(new NextRequest(`https://app.test/x`, json({ status: "closed" }, "PATCH")), ctx(id))).status, 404)
    assert.equal(fakeDb().tables.support_messages.length, 1)
  })

  it("anon is blocked", async () => {
    as(null)
    assert.equal((await list.GET(new NextRequest("https://app.test/api/support/tickets"))).status, 401)
    assert.equal((await list.POST(new NextRequest("https://app.test/api/support/tickets", json({ subject: "abc", body: "x" })))).status, 401)
  })

  it("admin sees all tickets, replies, and the customer is notified", async () => {
    const id = await openTicketAsA()
    as(ADMIN)
    const all = (await (await list.GET(new NextRequest("https://app.test/api/support/tickets?all=1"))).json()).tickets
    assert.equal(all.length, 1)
    assert.equal(all[0].email, "a@test.local")
    assert.equal((await one.POST(new NextRequest(`https://app.test/x`, json({ body: "Fixed, please retry" })), ctx(id))).status, 201)
    const t = fakeDb().tables.support_tickets[0]
    assert.equal(t.status, "waiting_customer")
    assert.equal(fakeDb().tables.support_messages[1].author_role, "admin")
    assert.ok(fakeDb().tables.notifications.some((n) => n.account_id === A && n.title === "Support replied"))
    assert.equal((await one.PATCH(new NextRequest(`https://app.test/x`, json({ status: "resolved" }, "PATCH")), ctx(id))).status, 200)
  })

  it("customers can only close their own ticket, not mark it resolved", async () => {
    const id = await openTicketAsA()
    assert.equal((await one.PATCH(new NextRequest(`https://app.test/x`, json({ status: "resolved" }, "PATCH")), ctx(id))).status, 403)
    assert.equal((await one.PATCH(new NextRequest(`https://app.test/x`, json({ status: "closed" }, "PATCH")), ctx(id))).status, 200)
    assert.equal((await one.POST(new NextRequest(`https://app.test/x`, json({ body: "again" })), ctx(id))).status, 409)
  })

  it("rejects empty tickets and rate limits creation", async () => {
    as(A)
    assert.equal((await list.POST(new NextRequest("https://app.test/api/support/tickets", json({ subject: "a", body: "" })))).status, 400)
    fakeDb().rpc = { take_inbound_rate_slot: () => ({ data: false, error: null }) }
    assert.equal((await list.POST(new NextRequest("https://app.test/api/support/tickets", json({ subject: "abc", body: "x" })))).status, 429)
  })

  it("admin status changes follow the ticket state machine", async () => {
    const id = await openTicketAsA()
    as(ADMIN)
    const patch = (status: string) => one.PATCH(new NextRequest("https://app.test/x", json({ status }, "PATCH")), ctx(id))
    assert.equal((await patch("closed")).status, 200)
    const illegal = await patch("resolved")
    assert.equal(illegal.status, 409, "closed -> resolved is not a move; reopen first")
    assert.deepEqual(await illegal.json().then((b: any) => [b.from, b.to]), ["closed", "resolved"])
    assert.equal((await patch("open")).status, 200, "admins can reopen")
  })
})
