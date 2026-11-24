import { loadAccount, measureUsage, resolveAccountPlan } from "@/lib/billing/enforce"
import { getRecommendations } from "@/lib/ai/recommendations/service"
import { createProposal, type ProposalRow } from "./proposals"
import type { AgentTool } from "./loop"

const DAY = 86_400_000
const noArgs = () => ({ ok: true as const, value: {} })

/** The tools the agent may call, bound to one account. Read tools return measured data only. */
export function buildTools(supabase: any, accountId: string, proposals: ProposalRow[], now = new Date()): AgentTool[] {
  let ids: Array<string | number> | null = null
  const profileIds = async () => {
    if (!ids) {
      const { data } = await supabase.from("users").select("id").eq("account_id", accountId)
      ids = (data || []).map((r: any) => r.id).filter((id: unknown) => id != null)
    }
    return ids!
  }

  return [
    {
      name: "get_recommendations",
      description: "Today's measured recommendation cards (waiting customers, idle automations, sentiment, plan limits).",
      args: {},
      parse: noArgs,
      run: async () => {
        const batch = await getRecommendations(supabase, accountId, now)
        return batch.items.map((i) => ({ severity: i.severity, title: i.title.en, detail: i.detail.en, evidence: i.evidence }))
      },
    },
    {
      name: "list_automations",
      description: "The account's automations with their id, name, active flag and how many times each fired in the last 7 days.",
      args: {},
      parse: noArgs,
      run: async () => {
        const profile = await profileIds()
        if (!profile.length) return []
        const { data: rules } = await supabase.from("automations").select("id, name, is_active, platform").in("user_id", profile).limit(50)
        const since = new Date(now.getTime() - 7 * DAY).toISOString()
        const { data: events } = await supabase.from("automation_events").select("automation_id").in("user_id", profile).gte("created_at", since).limit(5000)
        const runs: Record<string, number> = {}
        for (const e of events || []) if (e.automation_id) runs[e.automation_id] = (runs[e.automation_id] || 0) + 1
        return (rules || []).map((r: any) => ({ id: r.id, name: r.name, active: r.is_active !== false, platform: r.platform, runs_7d: runs[r.id] || 0 }))
      },
    },
    {
      name: "sentiment_summary",
      description: "Counts of positive / neutral / negative comments analysed in the last 30 days.",
      args: {},
      parse: noArgs,
      run: async () => {
        const since = new Date(now.getTime() - 30 * DAY).toISOString()
        const { data } = await supabase.from("comment_sentiment").select("sentiment").eq("account_id", accountId).gte("created_at", since).limit(2000)
        const out = { positive: 0, neutral: 0, negative: 0 }
        for (const s of data || []) if (s.sentiment in out) out[s.sentiment as keyof typeof out] += 1
        return out
      },
    },
    {
      name: "plan_usage",
      description: "Plan name and how much of the AI replies, contacts and channels limits is used (limit -1 means unlimited).",
      args: {},
      parse: noArgs,
      run: async () => {
        const account = await loadAccount(supabase, accountId)
        if (!account) return {}
        const plan = await resolveAccountPlan(supabase, account, now.getTime())
        const metrics = ["aiReplies", "contacts", "channels"] as const
        const usage = await Promise.all(metrics.map(async (m) => ({ metric: m, used: await measureUsage(supabase, accountId, m, now), limit: plan.limits[m] })))
        return { plan: plan.name, usage }
      },
    },
    {
      name: "propose_toggle_automation",
      description: "Suggest pausing or activating one automation. Nothing changes until the owner confirms.",
      args: { automation_id: "id from list_automations", active: "true to activate, false to pause" },
      parse: (raw: any) => {
        if (!raw || typeof raw.automation_id !== "string" || !/^[0-9a-f-]{36}$/i.test(raw.automation_id)) return { ok: false, error: "automation_id must be an id returned by list_automations." }
        if (typeof raw.active !== "boolean") return { ok: false, error: "active must be true or false." }
        return { ok: true, value: { automation_id: raw.automation_id, active: raw.active } }
      },
      run: async (args: { automation_id: string; active: boolean }) => {
        const profile = await profileIds()
        const { data } = profile.length ? await supabase.from("automations").select("id, name, is_active").eq("id", args.automation_id).in("user_id", profile).maybeSingle() : { data: null }
        if (!data) throw new Error("No such automation on this account.")
        const summary = `${args.active ? "Activate" : "Pause"} automation "${String(data.name).slice(0, 80)}"`
        const row = await createProposal(supabase, accountId, "toggle_automation", args, summary)
        proposals.push(row)
        return { proposed: true, summary, note: "Waiting for the owner's confirmation." }
      },
    },
  ]
}
