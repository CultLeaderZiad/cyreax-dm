/**
 * Agent access follows the plan that was bought (P1-2), run against the
 * in-memory Supabase fake.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { unlockedAgentIds } = await import("../lib/billing/agent-access.ts")

const ACC = "aaaaaaaa-0000-0000-0000-00000000000a"
const STARTER = "11111111-0000-0000-0000-0000000000s1"
const PRO = "11111111-0000-0000-0000-0000000000p1"
const [A1, A2, A3] = ["agent-1", "agent-2", "agent-3"]
const ALL = [A1, A2, A3]
const NOW = Date.parse("2026-11-17T12:00:00Z")
const later = new Date(NOW + 10 * 86_400_000).toISOString()

function seed(billing: Record<string, unknown> | null, account: Record<string, unknown> = {}) {
  const db = fakeDb()
  db.tables = {
    accounts: [{ id: ACC, role: "customer", plan: "monthly", ...account }],
    billing_accounts: billing ? [{ account_id: ACC, ...billing }] : [],
    plans: [
      { id: STARTER, name: "Starter", catalog_plan_id: "creator" },
      { id: PRO, name: "Agency Pro", catalog_plan_id: "agency_pro" },
    ],
    plan_agents: [
      { plan_id: STARTER, agent_id: A1 },
      { plan_id: PRO, agent_id: A1 },
      { plan_id: PRO, agent_id: A2 },
      { plan_id: PRO, agent_id: A3 },
    ],
  }
}

const access = async () => unlockedAgentIds(await getSupabaseBypassClient(), ACC, ALL, NOW)

describe("agents unlock from the purchased plan", () => {
  beforeEach(() => seed(null))

  it("a monthly Starter purchase unlocks only Starter's agents (no blanket unlock)", async () => {
    seed({ plan_id: "creator", status: "active", interval: "month", current_period_end: later, display_plan_id: STARTER })
    assert.deepEqual((await access()).agentIds, [A1])
  })

  it("a yearly Agency Pro purchase unlocks Pro's agents", async () => {
    seed({ plan_id: "agency_pro", status: "active", interval: "year", current_period_end: later, display_plan_id: PRO })
    assert.deepEqual((await access()).agentIds.sort(), ALL)
  })

  it("lifetime keeps its agents with no end date", async () => {
    seed({ plan_id: "agency_pro", status: "active", interval: "lifetime", current_period_end: null, display_plan_id: PRO })
    assert.deepEqual((await access()).agentIds.sort(), ALL)
  })

  it("an expired period unlocks nothing even though accounts.plan says monthly", async () => {
    seed({ plan_id: "agency_pro", status: "active", interval: "month", current_period_end: new Date(NOW - 1000).toISOString(), display_plan_id: PRO })
    assert.deepEqual((await access()).agentIds, [])
  })

  it("older purchases without display_plan_id use plans with the same catalog plan", async () => {
    seed({ plan_id: "creator", status: "active", interval: "month", current_period_end: later })
    assert.deepEqual((await access()).agentIds, [A1])
  })

  it("no billing row and accounts.plan = monthly is not a purchase of everything", async () => {
    seed(null)
    assert.ok((await access()).agentIds.length < ALL.length)
  })

  it("admins see every agent", async () => {
    seed(null, { role: "admin" })
    assert.deepEqual((await access()).agentIds, ALL)
  })
})
