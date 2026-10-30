import test from "node:test"
import assert from "node:assert/strict"
import {
  isHandoffDuplicate,
  recordHandoff,
  clearHandoffCache,
  HANDOFF_DEDUPE_WINDOW_MS,
  notifyHandoff,
} from "../lib/notifications/handoff.ts"

test("handoff notification deduplication - window math", async (t) => {
  await t.test("window constant is precisely 30 minutes (1,800,000 ms)", () => {
    assert.equal(HANDOFF_DEDUPE_WINDOW_MS, 30 * 60 * 1000)
    assert.equal(HANDOFF_DEDUPE_WINDOW_MS, 1800000)
  })

  await t.test("deduplicates within 30 minutes for the same conversation", () => {
    const customCache = new Map<string, number>()
    const t0 = 1700000000000
    const convId = "conv_12345"

    // Initial state: not duplicate
    assert.equal(isHandoffDuplicate(convId, { cache: customCache, now: t0 }), false)

    // Record at t0
    recordHandoff(convId, { cache: customCache, now: t0 })

    // Immediately after: duplicate
    assert.equal(isHandoffDuplicate(convId, { cache: customCache, now: t0 }), true)

    // 10 minutes later: still duplicate
    assert.equal(isHandoffDuplicate(convId, { cache: customCache, now: t0 + 10 * 60 * 1000 }), true)

    // 29 minutes and 59 seconds later: still duplicate
    assert.equal(
      isHandoffDuplicate(convId, { cache: customCache, now: t0 + 29 * 60 * 1000 + 59 * 1000 }),
      true
    )

    // Exactly 30 minutes + 1 second later: window expired, allowed
    assert.equal(
      isHandoffDuplicate(convId, { cache: customCache, now: t0 + 30 * 60 * 1000 + 1000 }),
      false
    )
  })

  await t.test("does not suppress different conversations at the same timestamp", () => {
    const customCache = new Map<string, number>()
    const t0 = 1700000000000

    recordHandoff("conv_A", { cache: customCache, now: t0 })

    assert.equal(isHandoffDuplicate("conv_A", { cache: customCache, now: t0 + 60000 }), true)
    assert.equal(isHandoffDuplicate("conv_B", { cache: customCache, now: t0 + 60000 }), false)
  })

  await t.test("empty or undefined key returns false safely", () => {
    assert.equal(isHandoffDuplicate(""), false)
  })
})

test("notifyHandoff - mock database and deduplication dispatch", async (t) => {
  t.beforeEach(() => {
    clearHandoffCache()
  })

  await t.test("first call creates notification; second call within 30 mins skips as duplicate", async () => {
    const insertedRows: any[] = []
    const mockSupabase = {
      from(table: string) {
        if (table === "notifications") {
          return {
            select(cols: string) {
              return {
                eq() {
                  return {
                    ilike() {
                      return {
                        gte() {
                          return {
                            async limit() {
                              return { data: [], error: null }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
            insert(row: any) {
              insertedRows.push(row)
              return {
                select() {
                  return {
                    async maybeSingle() {
                      return { data: { id: "notif_999" }, error: null }
                    },
                  }
                },
              }
            },
          }
        }
        if (table === "accounts") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          email: "test@example.com",
                          notification_settings: { handoff_alerts: true, email_alerts: true },
                        },
                        error: null,
                      }
                    },
                  }
                },
              }
            },
          }
        }
        return {}
      },
    }

    const first = await notifyHandoff({
      supabase: mockSupabase,
      workspaceId: "ws_1",
      accountId: "acc_1",
      contactName: "Layla",
      channel: "instagram",
      reason: "Needs human agent",
      conversationId: "conv_test_100",
    })

    assert.equal(first.skipped, false)
    assert.equal(first.notificationId, "notif_999")
    assert.equal(insertedRows.length, 1)
    assert.equal(insertedRows[0].kind, "handoff")
    assert.equal(insertedRows[0].link, "/dashboard/inbox?c=conv_test_100")
    assert.equal(insertedRows[0].title, "Handoff requested: Layla")

    // Second call for the same conversation within 30 minutes
    const second = await notifyHandoff({
      supabase: mockSupabase,
      workspaceId: "ws_1",
      accountId: "acc_1",
      contactName: "Layla",
      channel: "instagram",
      reason: "Needs human agent again",
      conversationId: "conv_test_100",
    })

    assert.equal(second.skipped, true)
    assert.equal(second.reason, "duplicate_in_memory")
    // Database insert was NOT called a second time
    assert.equal(insertedRows.length, 1)
  })

  await t.test("database deduplication skips if recent handoff row exists in DB", async () => {
    clearHandoffCache()

    const mockSupabaseWithRecent = {
      from(table: string) {
        if (table === "notifications") {
          return {
            select() {
              return {
                eq() {
                  return {
                    ilike() {
                      return {
                        gte() {
                          return {
                            eq() {
                              return {
                                async limit() {
                                  return {
                                    data: [{ id: "existing_notif", created_at: new Date().toISOString() }],
                                    error: null,
                                  }
                                },
                              }
                            },
                            async limit() {
                              return {
                                data: [{ id: "existing_notif", created_at: new Date().toISOString() }],
                                error: null,
                              }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
            insert() {
              throw new Error("Should not insert duplicate")
            },
          }
        }
        return {}
      },
    }

    const res = await notifyHandoff({
      supabase: mockSupabaseWithRecent,
      workspaceId: "ws_2",
      accountId: "acc_2",
      contactName: "Omar",
      channel: "tiktok",
      reason: "Handoff",
      conversationId: "conv_db_recent",
    })

    assert.equal(res.skipped, true)
    assert.equal(res.reason, "duplicate_in_db")
  })
})
