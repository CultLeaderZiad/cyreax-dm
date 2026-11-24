import { medianFirstResponseSeconds, rangeWindow, type MessageRow, type RangeKey } from "./period"

export interface Pair<T> {
  current: T
  previous: T
}

export interface OverviewKpis {
  range: RangeKey
  conversations: Pair<number>
  leads: Pair<number>
  replies: Pair<number>
  medianResponseSeconds: Pair<number | null>
}

type Window = { gte: string; lt: string }

async function countRows(query: any): Promise<number> {
  const { count, error } = await query
  return error ? 0 : count ?? 0
}

/**
 * The four overview numbers for the last N days and the same length before it,
 * all counted from real rows. A failed query counts as zero rather than
 * inventing a value.
 */
export async function loadOverviewKpis(supabase: any, userId: string | number, range: RangeKey, now = Date.now()): Promise<OverviewKpis> {
  const w = rangeWindow(range, now)
  const cur: Window = { gte: w.from.toISOString(), lt: new Date(now + 1000).toISOString() }
  const prev: Window = { gte: w.prevFrom.toISOString(), lt: w.from.toISOString() }

  const conversations = (win: Window) =>
    countRows(supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", win.gte).lt("created_at", win.lt))

  // A lead is a contact the customer left an email or phone for.
  const leads = async (win: Window) => {
    const { data, error } = await supabase.from("contacts").select("id, email, phone").eq("user_id", userId).gte("created_at", win.gte).lt("created_at", win.lt).limit(5000)
    if (error || !Array.isArray(data)) return 0
    return data.filter((c: any) => (c.email && String(c.email).trim()) || (c.phone && String(c.phone).trim())).length
  }

  const messages = async (win: Window) => {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, created_at, direction, is_from_instagram")
      .eq("user_id", userId)
      .gte("created_at", win.gte)
      .lt("created_at", win.lt)
      .limit(5000)
    if (error || !Array.isArray(data)) return { replies: 0, rows: [] as MessageRow[] }
    const rows: MessageRow[] = data.map((m: any) => ({
      conversation_id: String(m.conversation_id),
      created_at: m.created_at,
      inbound: m.direction ? m.direction === "in" : m.is_from_instagram === true,
    }))
    return { replies: rows.filter((r) => !r.inbound).length, rows }
  }

  const [convCur, convPrev, leadCur, leadPrev, msgCur, msgPrev] = await Promise.all([
    conversations(cur), conversations(prev), leads(cur), leads(prev), messages(cur), messages(prev),
  ])

  return {
    range,
    conversations: { current: convCur, previous: convPrev },
    leads: { current: leadCur, previous: leadPrev },
    replies: { current: msgCur.replies, previous: msgPrev.replies },
    medianResponseSeconds: { current: medianFirstResponseSeconds(msgCur.rows), previous: medianFirstResponseSeconds(msgPrev.rows) },
  }
}
