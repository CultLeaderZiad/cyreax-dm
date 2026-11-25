import { medianFirstResponseSeconds, rangeWindow, type MessageRow, type RangeKey } from "./period"

export interface Pair<T> {
  current: T
  previous: T
}

/** People the AI answered in a window, and how many of them it had to pass to a human. */
export interface AiHandling {
  answered: number
  handedOff: number
}

/** Share of AI-answered people who never needed a human, as a whole percent. Null when the AI answered nobody. */
export function aiResolutionRate(h: AiHandling): number | null {
  return h.answered > 0 ? Math.round(((h.answered - h.handedOff) / h.answered) * 100) : null
}

export interface OverviewKpis {
  range: RangeKey
  conversations: Pair<number>
  leads: Pair<number>
  replies: Pair<number>
  medianResponseSeconds: Pair<number | null>
  aiHandling: Pair<AiHandling>
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

  // Every AI answer is logged with whether it handed the person to a human (playground tests are not customers).
  const aiHandling = async (win: Window): Promise<AiHandling> => {
    const { data, error } = await supabase
      .from("ai_answer_logs")
      .select("contact_external_id, handoff")
      .eq("user_id", userId)
      .gte("created_at", win.gte)
      .lt("created_at", win.lt)
      .limit(5000)
    if (error || !Array.isArray(data)) return { answered: 0, handedOff: 0 }
    const people = new Map<string, boolean>()
    for (const row of data) {
      const id = row.contact_external_id
      if (!id || id === "playground") continue
      people.set(String(id), people.get(String(id)) === true || row.handoff === true)
    }
    return { answered: people.size, handedOff: [...people.values()].filter(Boolean).length }
  }

  const [convCur, convPrev, leadCur, leadPrev, msgCur, msgPrev, aiCur, aiPrev] = await Promise.all([
    conversations(cur), conversations(prev), leads(cur), leads(prev), messages(cur), messages(prev), aiHandling(cur), aiHandling(prev),
  ])

  return {
    range,
    conversations: { current: convCur, previous: convPrev },
    leads: { current: leadCur, previous: leadPrev },
    replies: { current: msgCur.replies, previous: msgPrev.replies },
    aiHandling: { current: aiCur, previous: aiPrev },
    medianResponseSeconds: { current: medianFirstResponseSeconds(msgCur.rows), previous: medianFirstResponseSeconds(msgPrev.rows) },
  }
}
