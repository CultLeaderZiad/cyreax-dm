/**
 * Changes the agent suggests. Stored as "pending" and applied only when the
 * customer confirms. The executors re-check ownership at confirm time, so a
 * proposal cannot be used to touch another account's data.
 */

export interface ProposalRow {
  id: string
  account_id: string
  action: string
  args: Record<string, unknown>
  summary: string
  status: "pending" | "confirmed" | "dismissed" | "failed"
  result: string | null
  created_at: string
}

type Executor = (supabase: any, accountId: string, args: any) => Promise<string>

async function profileIds(supabase: any, accountId: string): Promise<Array<string | number>> {
  const { data } = await supabase.from("users").select("id").eq("account_id", accountId)
  return (data || []).map((r: any) => r.id).filter((id: unknown) => id != null)
}

export const EXECUTORS: Record<string, Executor> = {
  toggle_automation: async (supabase, accountId, args) => {
    const ids = await profileIds(supabase, accountId)
    if (!ids.length) throw new Error("No workspace profile found.")
    const { data, error } = await supabase.from("automations").update({ is_active: Boolean(args.active) }).eq("id", String(args.automation_id)).in("user_id", ids).select("id, name, is_active")
    if (error) throw error
    if (!data?.length) throw new Error("Automation not found.")
    return `${data[0].name} is now ${data[0].is_active ? "active" : "paused"}.`
  },
}

export async function createProposal(supabase: any, accountId: string, action: string, args: Record<string, unknown>, summary: string): Promise<ProposalRow> {
  if (!EXECUTORS[action]) throw new Error("Unknown action")
  const { data, error } = await supabase.from("ai_agent_proposals").insert({ account_id: accountId, action, args, summary: summary.slice(0, 300), status: "pending" }).select("*").single()
  if (error) throw error
  return data
}

export async function decideProposal(supabase: any, accountId: string, id: string, decision: "confirm" | "dismiss"): Promise<ProposalRow | null> {
  // Atomic claim: only a still-pending row of this account moves on, so a double click or a replay applies it once.
  const next = decision === "confirm" ? "confirmed" : "dismissed"
  const claimed = await supabase
    .from("ai_agent_proposals")
    .update({ status: next, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", accountId)
    .eq("status", "pending")
    .select("*")
  const row: ProposalRow | undefined = claimed.data?.[0]
  if (!row) return null
  if (decision === "dismiss") return row

  const executor = EXECUTORS[row.action]
  let status: "confirmed" | "failed" = "confirmed"
  let result: string
  try {
    if (!executor) throw new Error("Unknown action")
    result = await executor(supabase, accountId, row.args)
  } catch (e: any) {
    status = "failed"
    result = String(e?.message || "failed").slice(0, 200)
  }
  await supabase.from("ai_agent_proposals").update({ status, result }).eq("id", id).eq("account_id", accountId)
  return { ...row, status, result }
}
