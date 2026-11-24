import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { parseRange, rangeWindow, percentDelta, secondsDelta, formatSeconds, medianFirstResponseSeconds } = await import("../lib/analytics/period.ts")

const t = (s: number) => new Date(Date.UTC(2026, 10, 24, 12, 0, s)).toISOString()

describe("period windows", () => {
  it("the previous window is the same length right before the current one", () => {
    const now = Date.UTC(2026, 10, 24)
    const w = rangeWindow("7d", now)
    assert.equal(now - w.from.getTime(), 7 * 86_400_000)
    assert.equal(w.from.getTime() - w.prevFrom.getTime(), 7 * 86_400_000)
    assert.equal(now - rangeWindow("today", now).from.getTime(), 86_400_000)
  })
  it("unknown ranges fall back to 7 days", () => {
    assert.equal(parseRange("30d"), "30d")
    assert.equal(parseRange("today"), "today")
    assert.equal(parseRange("evil"), "7d")
    assert.equal(parseRange(undefined), "7d")
  })
})

describe("deltas only show when there is something real to compare", () => {
  it("percent change against a real previous value", () => {
    assert.deepEqual(percentDelta(125, 100), { label: "+25%", direction: "increase" })
    assert.deepEqual(percentDelta(50, 200), { label: "-75%", direction: "decrease" })
    assert.deepEqual(percentDelta(103, 100), { label: "+3%", direction: "increase" })
  })
  it("nothing before, nothing now, or no change shows no number", () => {
    assert.equal(percentDelta(10, 0), null)
    assert.equal(percentDelta(0, 0), null)
    assert.equal(percentDelta(7, 7), null)
    assert.equal(percentDelta(NaN, 5), null)
  })
  it("response time difference needs both windows", () => {
    assert.deepEqual(secondsDelta(40, 61), { label: "-21s", direction: "decrease" })
    assert.deepEqual(secondsDelta(125, 60), { label: "+1m 05s", direction: "increase" })
    assert.equal(secondsDelta(40, null), null)
    assert.equal(secondsDelta(null, 40), null)
    assert.equal(secondsDelta(40, 40), null)
  })
  it("formats seconds readably", () => {
    assert.deepEqual([formatSeconds(8), formatSeconds(75), formatSeconds(3720)], ["8s", "1m 15s", "1h 02m"])
  })
})

describe("median first response", () => {
  it("measures first customer message to the first reply after it, per conversation", () => {
    const rows = [
      { conversation_id: "a", created_at: t(0), inbound: true },
      { conversation_id: "a", created_at: t(30), inbound: false },
      { conversation_id: "a", created_at: t(500), inbound: false },
      { conversation_id: "b", created_at: t(10), inbound: true },
      { conversation_id: "b", created_at: t(70), inbound: false },
      { conversation_id: "c", created_at: t(0), inbound: true },
      { conversation_id: "c", created_at: t(600), inbound: false },
    ]
    assert.equal(medianFirstResponseSeconds(rows), 60)
  })
  it("ignores conversations nobody answered or that started with our message, and is null with none", () => {
    assert.equal(medianFirstResponseSeconds([{ conversation_id: "a", created_at: t(0), inbound: true }]), null)
    assert.equal(medianFirstResponseSeconds([{ conversation_id: "a", created_at: t(0), inbound: false }]), null)
    assert.equal(medianFirstResponseSeconds([]), null)
  })
  it("averages the two middle values for an even count", () => {
    const rows = [
      { conversation_id: "a", created_at: t(0), inbound: true }, { conversation_id: "a", created_at: t(10), inbound: false },
      { conversation_id: "b", created_at: t(0), inbound: true }, { conversation_id: "b", created_at: t(30), inbound: false },
    ]
    assert.equal(medianFirstResponseSeconds(rows), 20)
  })
})
