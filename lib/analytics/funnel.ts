/**
 * Pure revenue and conversion funnel calculation helpers.
 * Handles zero values safely, never divides by zero or returns NaN,
 * and rounds all percentages to 1 decimal place.
 */

export interface FunnelStageCounts {
  comments: number
  conversations: number
  leads: number
  orders: number
}

export interface FunnelStageItem {
  id: "comments" | "conversations" | "leads" | "orders"
  name: string
  count: number
  pctOfTop: number // Percentage of the top stage (0 - 100, rounded to 1 decimal)
  conversionFromPrevious: number // Percentage of immediately preceding stage (0 - 100, rounded to 1 decimal)
  dropoffRate: number // 100 - conversionFromPrevious (rounded to 1 decimal)
}

export interface RevenueFunnelResult {
  overallConversion: number // (orders / comments) * 100 rounded to 1 decimal; 0 if comments === 0
  stages: FunnelStageItem[]
}

export interface DeltaResult {
  percent: number
  formatted: string // e.g. "+12.4%", "-3.2%", "0%"
  direction: "increase" | "decrease" | "neutral"
}

/**
 * Rounds a number to 1 decimal place safely.
 * Returns 0 if input is not finite or NaN.
 */
export function round1(num: number): number {
  if (!Number.isFinite(num) || Number.isNaN(num)) return 0
  return Math.round(num * 10) / 10
}

/**
 * Sanitizes input into a non-negative finite integer.
 */
export function sanitizeCount(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}

/**
 * Calculates conversion rates across standard 4-stage revenue funnel.
 * Handles zero stages gracefully without NaN or throwing.
 */
export function calculateRevenueFunnel(counts: FunnelStageCounts): RevenueFunnelResult {
  const comments = sanitizeCount(counts?.comments)
  const conversations = sanitizeCount(counts?.conversations)
  const leads = sanitizeCount(counts?.leads)
  const orders = sanitizeCount(counts?.orders)

  const top = comments
  const overallConversion = top > 0 ? round1((orders / top) * 100) : 0

  const definitions: Array<{ id: FunnelStageItem["id"]; name: string; count: number }> = [
    { id: "comments", name: "Comments on Automations", count: comments },
    { id: "conversations", name: "DM Conversations Opened", count: conversations },
    { id: "leads", name: "Leads Captured (Email/Phone/Order)", count: leads },
    { id: "orders", name: "Completed Paid Orders", count: orders },
  ]

  let prevCount: number | null = null

  const stages: FunnelStageItem[] = definitions.map((def, idx) => {
    let pctOfTop = 0
    let conversionFromPrevious = 0

    if (idx === 0) {
      pctOfTop = def.count > 0 ? 100 : 0
      conversionFromPrevious = def.count > 0 ? 100 : 0
    } else {
      if (top > 0) {
        pctOfTop = round1((def.count / top) * 100)
      } else {
        pctOfTop = 0
      }

      if (prevCount !== null && prevCount > 0) {
        conversionFromPrevious = round1((def.count / prevCount) * 100)
      } else {
        conversionFromPrevious = 0
      }
    }

    prevCount = def.count

    return {
      id: def.id,
      name: def.name,
      count: def.count,
      pctOfTop,
      conversionFromPrevious,
      dropoffRate: round1(Math.max(0, 100 - conversionFromPrevious)),
    }
  })

  return {
    overallConversion,
    stages,
  }
}

/**
 * Calculates period-over-period percentage delta.
 * Returns clean formatted string (e.g. "+12.4%", "-5.0%", "0%").
 */
export function calculateDelta(current: number, previous: number): DeltaResult {
  const cur = sanitizeCount(current)
  const prev = sanitizeCount(previous)

  if (prev === 0) {
    if (cur === 0) {
      return { percent: 0, formatted: "0%", direction: "neutral" }
    }
    return { percent: 100, formatted: "+100%", direction: "increase" }
  }

  const diff = cur - prev
  const pct = round1((diff / prev) * 100)

  if (pct > 0) {
    return { percent: pct, formatted: `+${pct}%`, direction: "increase" }
  }
  if (pct < 0) {
    return { percent: pct, formatted: `${pct}%`, direction: "decrease" }
  }
  return { percent: 0, formatted: "0%", direction: "neutral" }
}

/**
 * Formats a currency amount in minor units (cents) with Intl.NumberFormat.
 * Defaults to EGP if not specified.
 */
export function formatCurrencyAmount(
  cents: number,
  currency: string = "EGP",
  locale: string = "en-US"
): string {
  const curr = (currency || "EGP").toUpperCase()
  const amount = (Number.isFinite(cents) ? cents : 0) / 100
  const loc = locale === "ar" ? "ar-EG" : "en-US"

  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency: curr,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString(loc)} ${curr}`
  }
}
