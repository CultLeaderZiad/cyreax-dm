/**
 * The overview cards are counted from real rows for the chosen range and for
 * the same length right before it, and nothing else.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { getSupabaseBypassClient } = await import("../lib/supabase-server.ts")
const { loadOverviewKpis, aiResolutionRate } = await import("../lib/analytics/overview.ts")

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0)
const day = 86_400_000
const ago = (days: number, extraSeconds = 0) => new Date(NOW - days * day + extraSeconds * 1000).toISOString()

beforeEach(() => {
  const db = fakeDb()
  db.rpc = {}
  db.tables = {
    conversations: [
      { id: "c1", user_id: 1, created_at: ago(1) }, { id: "c2", user_id: 1, created_at: ago(3) }, { id: "c3", user_id: 1, created_at: ago(5) },
      { id: "p1", user_id: 1, created_at: ago(9) }, { id: "p2", user_id: 1, created_at: ago(12) },
      { id: "old", user_id: 1, created_at: ago(40) },
      { id: "other", user_id: 2, created_at: ago(1) },
    ],
    contacts: [
      { id: 1, user_id: 1, email: "a@x.test", phone: null, created_at: ago(2) },
      { id: 2, user_id: 1, email: "", phone: "  ", created_at: ago(2) },
      { id: 3, user_id: 1, email: null, phone: "+20100", created_at: ago(8) },
      { id: 4, user_id: 2, email: "z@x.test", phone: null, created_at: ago(2) },
    ],
    messages: [
      { id: "m1", user_id: 1, conversation_id: "c1", created_at: ago(1), direction: "in" },
      { id: "m2", user_id: 1, conversation_id: "c1", created_at: ago(1, 40), direction: "out" },
      { id: "m3", user_id: 1, conversation_id: "c2", created_at: ago(3), direction: "in" },
      { id: "m4", user_id: 1, conversation_id: "c2", created_at: ago(3, 20), direction: "out" },
      { id: "m5", user_id: 1, conversation_id: "p1", created_at: ago(9), direction: "in" },
      { id: "m6", user_id: 1, conversation_id: "p1", created_at: ago(9, 120), direction: "out" },
      { id: "m7", user_id: 2, conversation_id: "other", created_at: ago(1), direction: "out" },
    ],
    ai_answer_logs: [
      { id: "a1", user_id: 1, contact_external_id: "u1", handoff: false, created_at: ago(1) },
      { id: "a2", user_id: 1, contact_external_id: "u1", handoff: false, created_at: ago(1) },
      { id: "a3", user_id: 1, contact_external_id: "u2", handoff: false, created_at: ago(2) },
      { id: "a4", user_id: 1, contact_external_id: "u3", handoff: true, created_at: ago(2) },
      { id: "a5", user_id: 1, contact_external_id: "u3", handoff: false, created_at: ago(3) },
      { id: "a6", user_id: 1, contact_external_id: "playground", handoff: true, created_at: ago(1) },
      { id: "a7", user_id: 1, contact_external_id: "u4", handoff: true, created_at: ago(9) },
      { id: "a8", user_id: 2, contact_external_id: "x", handoff: true, created_at: ago(1) },
    ],
  }
})

describe("overview KPIs", () => {
  it("counts the last 7 days and the 7 days before, for this account only", async () => {
    const db = await getSupabaseBypassClient()
    const k = await loadOverviewKpis(db, 1, "7d", NOW)
    assert.deepEqual(k.conversations, { current: 3, previous: 2 })
    assert.deepEqual(k.leads, { current: 1, previous: 1 })
    assert.deepEqual(k.replies, { current: 2, previous: 1 })
    assert.deepEqual(k.medianResponseSeconds, { current: 30, previous: 120 })
  })

  it("a wider range widens both windows", async () => {
    const db = await getSupabaseBypassClient()
    const k = await loadOverviewKpis(db, 1, "30d", NOW)
    assert.equal(k.conversations.current, 5)
    assert.equal(k.conversations.previous, 1)
  })

  it("an empty account is all zeros and no response time, never invented numbers", async () => {
    const db = await getSupabaseBypassClient()
    const k = await loadOverviewKpis(db, 99, "7d", NOW)
    assert.deepEqual([k.conversations, k.leads, k.replies], [{ current: 0, previous: 0 }, { current: 0, previous: 0 }, { current: 0, previous: 0 }])
    assert.deepEqual(k.medianResponseSeconds, { current: null, previous: null })
  })

  it("AI resolution counts people the AI answered who were never handed to a human", async () => {
    const db = await getSupabaseBypassClient()
    const k = await loadOverviewKpis(db, 1, "7d", NOW)
    // u1, u2 resolved; u3 was handed over (any handoff turn counts); the playground is not a customer.
    assert.deepEqual(k.aiHandling.current, { answered: 3, handedOff: 1 })
    assert.deepEqual(k.aiHandling.previous, { answered: 1, handedOff: 1 })
    assert.equal(aiResolutionRate(k.aiHandling.current), 67)
    assert.equal(aiResolutionRate(k.aiHandling.previous), 0)
  })

  it("AI resolution is unknown, not zero, when the AI answered nobody", async () => {
    const db = await getSupabaseBypassClient()
    const k = await loadOverviewKpis(db, 99, "7d", NOW)
    assert.equal(aiResolutionRate(k.aiHandling.current), null)
  })
})
