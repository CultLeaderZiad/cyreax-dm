/**
 * Period-over-period comparison for the overview cards. The current window is
 * the last N days (or 24 hours for "today") and the previous window is the same
 * length right before it, so both come from real rows. Pure helpers: the API
 * does the counting, these decide how it is shown.
 */

export type RangeKey = "today" | "7d" | "30d"

const DAY = 86_400_000
const SPAN: Record<RangeKey, number> = { today: DAY, "7d": 7 * DAY, "30d": 30 * DAY }

export function parseRange(value: unknown): RangeKey {
  return value === "today" || value === "30d" ? value : "7d"
}

export function rangeWindow(range: RangeKey, now = Date.now()) {
  const span = SPAN[range]
  return { from: new Date(now - span), to: new Date(now), prevFrom: new Date(now - 2 * span) }
}

export interface Delta {
  label: string
  direction: "increase" | "decrease"
}

/**
 * "+12.4%" or "-3.1%" against the previous window. Returns null when there is
 * nothing real to compare with (no previous activity, or no change at all), so a
 * card never shows an invented or meaningless number.
 */
export function percentDelta(current: number, previous: number): Delta | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  const pct = Math.round(((current - previous) / previous) * 1000) / 10
  if (pct === 0) return null
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, direction: pct > 0 ? "increase" : "decrease" }
}

/** Difference in seconds, for response times. Null unless both windows have a measurement. */
export function secondsDelta(current: number | null, previous: number | null): Delta | null {
  if (current == null || previous == null) return null
  const diff = Math.round(current - previous)
  if (diff === 0) return null
  return { label: `${diff > 0 ? "+" : "-"}${formatSeconds(Math.abs(diff))}`, direction: diff > 0 ? "increase" : "decrease" }
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`
}

export interface MessageRow {
  conversation_id: string
  created_at: string
  inbound: boolean
}

/**
 * Median seconds from a customer's first message to the first reply that came
 * after it, over the conversations in the rows. Null with no answered conversation.
 */
export function medianFirstResponseSeconds(rows: MessageRow[]): number | null {
  const byConversation = new Map<string, MessageRow[]>()
  for (const row of rows) {
    const list = byConversation.get(row.conversation_id)
    if (list) list.push(row)
    else byConversation.set(row.conversation_id, [row])
  }
  const waits: number[] = []
  for (const list of byConversation.values()) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    const firstInbound = list.find((m) => m.inbound)
    if (!firstInbound) continue
    const reply = list.find((m) => !m.inbound && Date.parse(m.created_at) >= Date.parse(firstInbound.created_at))
    if (!reply) continue
    waits.push((Date.parse(reply.created_at) - Date.parse(firstInbound.created_at)) / 1000)
  }
  if (!waits.length) return null
  waits.sort((a, b) => a - b)
  const mid = Math.floor(waits.length / 2)
  return Math.round(waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2)
}
