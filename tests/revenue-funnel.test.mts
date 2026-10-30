import test from "node:test"
import assert from "node:assert/strict"
import {
  calculateRevenueFunnel,
  calculateDelta,
  round1,
  sanitizeCount,
  formatCurrencyAmount,
} from "../lib/analytics/funnel.ts"

test("funnel math - standard numbers matching business flow", async (t) => {
  await t.test("calculates conversions matching the problem specification (2940 -> 1826 -> 612 -> 228)", () => {
    const result = calculateRevenueFunnel({
      comments: 2940,
      conversations: 1826,
      leads: 612,
      orders: 228,
    })

    // Overall conversion: 228 / 2940 * 100 = 7.755... -> 7.8%
    assert.equal(result.overallConversion, 7.8)

    // Stage 0: Comments
    assert.equal(result.stages[0].id, "comments")
    assert.equal(result.stages[0].count, 2940)
    assert.equal(result.stages[0].pctOfTop, 100)
    assert.equal(result.stages[0].conversionFromPrevious, 100)

    // Stage 1: Conversations (1826 / 2940 = 62.1%)
    assert.equal(result.stages[1].id, "conversations")
    assert.equal(result.stages[1].count, 1826)
    assert.equal(result.stages[1].pctOfTop, 62.1)
    assert.equal(result.stages[1].conversionFromPrevious, 62.1)

    // Stage 2: Leads (612 / 2940 = 20.8%, 612 / 1826 = 33.5%)
    assert.equal(result.stages[2].id, "leads")
    assert.equal(result.stages[2].count, 612)
    assert.equal(result.stages[2].pctOfTop, 20.8)
    assert.equal(result.stages[2].conversionFromPrevious, 33.5)

    // Stage 3: Orders (228 / 2940 = 7.8%, 228 / 612 = 37.3%)
    assert.equal(result.stages[3].id, "orders")
    assert.equal(result.stages[3].count, 228)
    assert.equal(result.stages[3].pctOfTop, 7.8)
    assert.equal(result.stages[3].conversionFromPrevious, 37.3)
  })
})

test("funnel math - zero and edge case handling", async (t) => {
  await t.test("all zeros returns safe zero values without NaN or division by zero", () => {
    const result = calculateRevenueFunnel({
      comments: 0,
      conversations: 0,
      leads: 0,
      orders: 0,
    })

    assert.equal(result.overallConversion, 0)
    for (const stage of result.stages) {
      assert.equal(stage.count, 0)
      assert.equal(stage.pctOfTop, 0)
      assert.equal(stage.conversionFromPrevious, 0)
      assert.equal(stage.dropoffRate, 100)
    }
  })

  await t.test("zero top of funnel with downstream counts handles safely", () => {
    const result = calculateRevenueFunnel({
      comments: 0,
      conversations: 50,
      leads: 10,
      orders: 2,
    })

    assert.equal(result.overallConversion, 0)
    assert.equal(result.stages[0].count, 0)
    assert.equal(result.stages[0].pctOfTop, 0)
    // Downstream stages with 0 top default to 0% of top
    assert.equal(result.stages[1].pctOfTop, 0)
  })

  await t.test("intermediate drop to zero handles next stages safely", () => {
    const result = calculateRevenueFunnel({
      comments: 100,
      conversations: 0,
      leads: 0,
      orders: 0,
    })

    assert.equal(result.overallConversion, 0)
    assert.equal(result.stages[1].count, 0)
    assert.equal(result.stages[1].conversionFromPrevious, 0)
    assert.equal(result.stages[2].conversionFromPrevious, 0)
    assert.equal(result.stages[3].conversionFromPrevious, 0)
  })

  await t.test("negative and non-number inputs are sanitized to zero", () => {
    const result = calculateRevenueFunnel({
      comments: -50,
      conversations: NaN as any,
      leads: undefined as any,
      orders: "invalid" as any,
    })

    assert.equal(result.overallConversion, 0)
    assert.equal(result.stages[0].count, 0)
    assert.equal(result.stages[1].count, 0)
    assert.equal(result.stages[2].count, 0)
    assert.equal(result.stages[3].count, 0)
  })

  await t.test("100% conversion through all stages", () => {
    const result = calculateRevenueFunnel({
      comments: 100,
      conversations: 100,
      leads: 100,
      orders: 100,
    })

    assert.equal(result.overallConversion, 100)
    for (const stage of result.stages) {
      assert.equal(stage.pctOfTop, 100)
      assert.equal(stage.conversionFromPrevious, 100)
      assert.equal(stage.dropoffRate, 0)
    }
  })
})

test("delta calculations", async (t) => {
  await t.test("calculates positive delta correctly", () => {
    const delta = calculateDelta(112, 100)
    assert.equal(delta.percent, 12)
    assert.equal(delta.formatted, "+12%")
    assert.equal(delta.direction, "increase")
  })

  await t.test("calculates negative delta correctly", () => {
    const delta = calculateDelta(85, 100)
    assert.equal(delta.percent, -15)
    assert.equal(delta.formatted, "-15%")
    assert.equal(delta.direction, "decrease")
  })

  await t.test("calculates zero delta correctly", () => {
    const delta = calculateDelta(100, 100)
    assert.equal(delta.percent, 0)
    assert.equal(delta.formatted, "0%")
    assert.equal(delta.direction, "neutral")
  })

  await t.test("handles previous zero safely without Infinity", () => {
    const deltaWithPrevZero = calculateDelta(25, 0)
    assert.equal(deltaWithPrevZero.percent, 100)
    assert.equal(deltaWithPrevZero.formatted, "+100%")
    assert.equal(deltaWithPrevZero.direction, "increase")

    const deltaBothZero = calculateDelta(0, 0)
    assert.equal(deltaBothZero.percent, 0)
    assert.equal(deltaBothZero.formatted, "0%")
    assert.equal(deltaBothZero.direction, "neutral")
  })
})

test("currency formatting", async (t) => {
  await t.test("formats EGP amount by default", () => {
    const formatted = formatCurrencyAmount(135000, "EGP", "en-US")
    assert.ok(formatted.includes("1,350") || formatted.includes("EGP"))
  })

  await t.test("handles zero cents safely", () => {
    const formatted = formatCurrencyAmount(0, "EGP", "en-US")
    assert.ok(formatted.includes("0"))
  })
})
