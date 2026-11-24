import { loadAccount, measureUsage, resolveAccountPlan } from "@/lib/billing/enforce"
import { computeRecommendations, periodKey, type Recommendation } from "./signals"

export interface RecommendationBatch {
  level: "weekly" | "daily"
  periodKey: string
  generatedAt: string
  summary: string | null
  items: Recommendation[]
  cached: boolean
}

export class InsightsDisabledError extends Error {
  constructor() {
    super("AI recommendations are not included in this plan.")
    this.name = "InsightsDisabledError"
  }
}

const DAY = 86_400_000

/**
 * Today's (or this week's) batch for an account. The plan decides the
 * frequency: Starter gets one batch per ISO week, Pro and Agency one per day.
 * A stored batch is returned as is, so refreshing the page costs nothing.
 */
export async function getRecommendations(supabase: any, accountId: string, now = new Date()): Promise<RecommendationBatch> {
  const account = await loadAccount(supabase, accountId)
  if (!account) throw new InsightsDisabledError()
  const plan = await resolveAccountPlan(supabase, account, now.getTime())
  const level = plan.limits.insights
  if (plan.blocked || level === "none") throw new InsightsDisabledError()

  const key = periodKey(level, now)
  const stored = await supabase.from("ai_recommendations").select("items, summary, generated_at").eq("account_id", accountId).eq("period_key", key).maybeSingle()
  if (stored.data) {
    return { level, periodKey: key, generatedAt: stored.data.generated_at, summary: stored.data.summary, items: stored.data.items || [], cached: true }
  }

  const items = await measure(supabase, accountId, plan, now)
  const summary = await summarise(accountId, items)
  const generatedAt = now.toISOString()
  // A concurrent request may have stored the same period first: keep that one.
  await supabase.from("ai_recommendations").upsert({ account_id: accountId, period_key: key, items, summary, generated_at: generatedAt }, { onConflict: "account_id,period_key", ignoreDuplicates: true })
  return { level, periodKey: key, generatedAt, summary, items, cached: false }
}

async function measure(supabase: any, accountId: string, plan: any, now: Date): Promise<Recommendation[]> {
  const profiles = await supabase.from("users").select("id").eq("account_id", accountId)
  const ids: Array<string | number> = (profiles.data || []).map((r: any) => r.id).filter((id: unknown) => id != null)
  const since14 = new Date(now.getTime() - 14 * DAY).toISOString()
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString()

  let conversations: Array<{ lastMessageAt: string | null; lastIsInbound: boolean }> = []
  let automations: Array<{ id: string; name: string; isActive: boolean; createdAt: string; events14d: number }> = []
  if (ids.length) {
    const convs = await supabase.from("conversations").select("id, last_message_at").in("user_id", ids).gte("last_message_at", since14).order("last_message_at", { ascending: false }).limit(200)
    const convRows: any[] = convs.data || []
    const lastInbound: Record<string, boolean> = {}
    if (convRows.length) {
      const msgs = await supabase.from("messages").select("conversation_id, is_from_instagram, created_at").in("conversation_id", convRows.map((c) => c.id)).order("created_at", { ascending: false }).limit(convRows.length * 3)
      for (const m of msgs.data || []) if (!(m.conversation_id in lastInbound)) lastInbound[m.conversation_id] = m.is_from_instagram === true
    }
    conversations = convRows.map((c) => ({ lastMessageAt: c.last_message_at, lastIsInbound: lastInbound[c.id] === true }))

    const autos = await supabase.from("automations").select("id, name, is_active, created_at").in("user_id", ids)
    const events = await supabase.from("automation_events").select("automation_id").in("user_id", ids).gte("created_at", since14).limit(5000)
    const perAutomation: Record<string, number> = {}
    for (const e of events.data || []) if (e.automation_id) perAutomation[e.automation_id] = (perAutomation[e.automation_id] || 0) + 1
    automations = (autos.data || []).map((a: any) => ({ id: a.id, name: a.name, isActive: a.is_active !== false, createdAt: a.created_at, events14d: perAutomation[a.id] || 0 }))
  }

  const sentimentRows = await supabase.from("comment_sentiment").select("sentiment").eq("account_id", accountId).gte("created_at", since30).limit(2000)
  const sentiment = { positive: 0, neutral: 0, negative: 0 }
  for (const s of sentimentRows.data || []) if (s.sentiment in sentiment) sentiment[s.sentiment as keyof typeof sentiment] += 1

  const usage = await Promise.all(
    (["aiReplies", "contacts", "channels"] as const).map(async (metric) => ({ metric, used: await measureUsage(supabase, accountId, metric, now), limit: plan.limits[metric] as number })),
  )

  return computeRecommendations({ now: now.getTime(), conversations, automations, sentiment, usage })
}

/** One short paragraph written by the model from the measured cards only. Optional: failures leave it empty. */
async function summarise(accountId: string, items: Recommendation[]): Promise<string | null> {
  if (items.length === 0) return null
  try {
    const { generateGroqCompletion } = await import("@/lib/groq-client")
    const facts = items.map((i) => `- ${i.title.en}: ${i.detail.en}`).join("\n")
    const text = await generateGroqCompletion(accountId, "growth_insights", {
      temperature: 0.3,
      max_tokens: 220,
      messages: [
        { role: "system", content: "You write one short, plain paragraph (max 60 words) telling a business owner what to do first. Use ONLY the facts given. Never add numbers, names or claims that are not in the facts. Write in English." },
        { role: "user", content: facts },
      ],
    })
    return text ? text.trim().slice(0, 600) : null
  } catch {
    return null
  }
}
