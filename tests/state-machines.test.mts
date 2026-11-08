import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync, readdirSync } from "node:fs"

const { MACHINES, canTransition, transition, isTerminal, stateLabel } = await import("../lib/state/machines.ts")
const { renderStateDocs } = await import("../scripts/state-docs.mts")
const { applyOrderStatus } = await import("../lib/commerce/orders.ts")

/** Every `status IN (...)` / `<table>_status_check` set declared in SQL. */
function sqlStatusSets(): Map<string, string[]> {
  const files = [
    "schema.sql",
    ...readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => `supabase/migrations/${f}`),
    ...readdirSync("scripts").filter((f) => f.endsWith(".sql")).map((f) => `scripts/${f}`),
  ]
  const sql = files.map((f) => readFileSync(f, "utf8")).join("\n")
  const sets = new Map<string, string[]>()
  const values = (list: string) => [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  for (const m of sql.matchAll(/(\w+)_status_check\W+CHECK \(status IN \(([^)]*)\)/g)) sets.set(m[1], values(m[2]))
  for (const t of sql.matchAll(/CREATE TABLE IF NOT EXISTS (?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const inline = t[2].match(/\n\s*status\s+text[^\n]*CHECK \(status IN \(([^)]*)\)/i)
    if (inline && !sets.has(t[1])) sets.set(t[1], values(inline[1]))
  }
  return sets
}

describe("state machine registry", () => {
  const sql = sqlStatusSets()

  for (const [name, m] of Object.entries(MACHINES)) {
    const states = Object.keys(m.transitions)
    it(`${name}: well-formed (initial known, targets known, every state reachable)`, () => {
      assert.ok(states.includes(m.initial), "initial state is declared")
      const t = m.transitions as Record<string, readonly string[]>
      for (const [from, tos] of Object.entries(t)) for (const to of tos) assert.ok(states.includes(to), `${from} -> ${to}`)
      const seen = new Set<string>([m.initial])
      const queue: string[] = [m.initial]
      while (queue.length) for (const n of t[queue.shift()!]) if (!seen.has(n)) { seen.add(n); queue.push(n) }
      // Orders can also be created directly as drafts (lib/commerce/checkout.ts).
      const extraRoots = name === "order" ? ["draft"] : []
      assert.deepEqual(states.filter((s) => !seen.has(s) && !extraRoots.includes(s)), [], "unreachable from the initial state")
    })

    if (sql.has(m.table)) {
      it(`${name}: matches the SQL CHECK on ${m.table}.status`, () => {
        assert.deepEqual([...states].sort(), [...sql.get(m.table)!].sort())
      })
    }
  }

  it("covers every status column that has a SQL CHECK", () => {
    const tables = new Set(Object.values(MACHINES).map((m) => m.table))
    const ignored = new Set(["subscriptions", "email_campaign_recipients", "enterprise_inquiries", "payment_submissions", "inbound_events"])
    const missing = [...sql.keys()].filter((t) => !tables.has(t) && !ignored.has(t))
    assert.deepEqual(missing, [], "add these tables to lib/state/machines.ts")
  })

  it("docs/STATE_MACHINES.md is up to date (run pnpm state:docs)", () => {
    assert.equal(readFileSync("docs/STATE_MACHINES.md", "utf8"), renderStateDocs())
  })
})

describe("guards", () => {
  it("orders behave exactly as before", () => {
    assert.deepEqual(applyOrderStatus("pending_payment", "paid"), { status: "paid", changed: true })
    assert.deepEqual(applyOrderStatus("paid", "cancelled"), { status: "cancelled", changed: true })
    assert.deepEqual(applyOrderStatus("cancelled", "paid"), { status: "cancelled", changed: false })
    assert.deepEqual(applyOrderStatus("paid", "paid"), { status: "paid", changed: false })
    assert.deepEqual(applyOrderStatus("refunded", "fulfilled"), { status: "refunded", changed: false })
  })
  it("payments are final once reviewed", () => {
    assert.equal(canTransition("paymentSubmission", "pending", "approved"), true)
    assert.equal(canTransition("paymentSubmission", "approved", "rejected"), false)
    assert.equal(isTerminal("paymentSubmission", "rejected"), true)
  })
  it("support tickets: closed can only be reopened, unknown states refused", () => {
    assert.equal(canTransition("supportTicket", "closed", "resolved"), false)
    assert.equal(canTransition("supportTicket", "closed", "open"), true)
    assert.deepEqual(transition("supportTicket", "open", "bogus"), { status: "open", changed: false })
  })
  it("labels come from one place, in both languages", () => {
    assert.equal(stateLabel("paymentSubmission", "pending"), "Under review")
    assert.equal(stateLabel("paymentSubmission", "pending", "ar"), "قيد المراجعة")
    assert.equal(stateLabel("flowJob", "dead"), "dead")
  })
})
