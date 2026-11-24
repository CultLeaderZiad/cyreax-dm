import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { chatWithAgent, AgentNotInPlanError } = await import("../lib/ai/agent/service.ts")
const { decideProposal } = await import("../lib/ai/agent/proposals.ts")

const A = "aaaaaaaa-0000-0000-0000-00000000000a"
const B = "bbbbbbbb-0000-0000-0000-00000000000b"
const AUTO_A = "11111111-0000-0000-0000-000000000001"
const AUTO_B = "22222222-0000-0000-0000-000000000002"

function seed(plan = "creator_plus") {
  const db = fakeDb()
  db.rpc = {}
  db.tables = {
    accounts: [{ id: A, plan: "monthly", role: "customer" }, { id: B, plan: "monthly", role: "customer" }],
    users: [{ id: 1, account_id: A }, { id: 2, account_id: B }],
    billing_accounts: [{ account_id: A, plan_id: plan, status: "active", interval: "month", current_period_end: "2099-01-01T00:00:00Z" }],
    plans: [],
    automations: [{ id: AUTO_A, user_id: 1, name: "Promo", is_active: true }, { id: AUTO_B, user_id: 2, name: "Other", is_active: true }],
    automation_events: [], ai_agent_proposals: [],
  }
}
const llm = (...r: string[]) => { let i = 0; return async () => r[Math.min(i++, r.length - 1)] }

describe("Growth Agent actions", () => {
  beforeEach(() => seed())

  it("a proposal changes nothing until the owner confirms", async () => {
    const db = await getSupabaseBypassClient()
    const out = await chatWithAgent(db, A, { message: "pause promo" }, llm(`{"tool":"propose_toggle_automation","args":{"automation_id":"${AUTO_A}","active":false}}`, '{"final":"Waiting for your confirmation."}'))
    assert.equal(out.proposals.length, 1)
    assert.equal(fakeDb().tables.automations[0].is_active, true)
    const done = await decideProposal(db, A, out.proposals[0].id, "confirm")
    assert.equal(done?.status, "confirmed")
    assert.equal(fakeDb().tables.automations[0].is_active, false)
  })

  it("confirming twice applies it once", async () => {
    const db = await getSupabaseBypassClient()
    const out = await chatWithAgent(db, A, { message: "x" }, llm(`{"tool":"propose_toggle_automation","args":{"automation_id":"${AUTO_A}","active":false}}`, '{"final":"ok"}'))
    assert.ok(await decideProposal(db, A, out.proposals[0].id, "confirm"))
    assert.equal(await decideProposal(db, A, out.proposals[0].id, "confirm"), null)
  })

  it("dismissing applies nothing", async () => {
    const db = await getSupabaseBypassClient()
    const out = await chatWithAgent(db, A, { message: "x" }, llm(`{"tool":"propose_toggle_automation","args":{"automation_id":"${AUTO_A}","active":false}}`, '{"final":"ok"}'))
    assert.equal((await decideProposal(db, A, out.proposals[0].id, "dismiss"))?.status, "dismissed")
    assert.equal(fakeDb().tables.automations[0].is_active, true)
  })

  it("cannot propose or confirm a change to another account's automation", async () => {
    const db = await getSupabaseBypassClient()
    const out = await chatWithAgent(db, A, { message: "x" }, llm(`{"tool":"propose_toggle_automation","args":{"automation_id":"${AUTO_B}","active":false}}`, '{"final":"ok"}'))
    assert.equal(out.proposals.length, 0)
    // a proposal row forged for another account cannot be decided by this one
    fakeDb().tables.ai_agent_proposals.push({ id: "33333333-0000-0000-0000-000000000003", account_id: B, action: "toggle_automation", args: { automation_id: AUTO_B, active: false }, summary: "s", status: "pending" })
    assert.equal(await decideProposal(db, A, "33333333-0000-0000-0000-000000000003", "confirm"), null)
    assert.equal(fakeDb().tables.automations[1].is_active, true)
  })

  it("plans without the agent are refused", async () => {
    seed("creator")
    const db = await getSupabaseBypassClient()
    await assert.rejects(chatWithAgent(db, A, { message: "x" }, llm('{"final":"x"}')), AgentNotInPlanError)
  })

  it("an admin can switch the agent on for Starter without a deploy", async () => {
    seed("creator")
    fakeDb().tables.plans = [{ catalog_plan_id: "creator", entitlements: { aiAgent: true } }]
    const db = await getSupabaseBypassClient()
    const out = await chatWithAgent(db, A, { message: "x" }, llm('{"final":"hello"}'))
    assert.equal(out.reply, "hello")
  })
})
