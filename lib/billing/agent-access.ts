import { loadAccount, resolveAccountPlan } from "@/lib/billing/enforce"

/**
 * Agent ids an account may use, from what it actually bought.
 *
 * - Admins: every agent.
 * - Expired / no paid plan: none.
 * - Otherwise: the plan_agents rows of the display plan that was bought
 *   (billing_accounts.display_plan_id), or, for older purchases without it,
 *   of every display plan whose catalog_plan_id is the entitled plan.
 *
 * This replaces "accounts.plan = monthly unlocks every agent".
 */
export async function unlockedAgentIds(
  supabase: any,
  accountId: string,
  allAgentIds: string[],
  nowMs = Date.now(),
): Promise<{ planId: string; agentIds: string[] }> {
  const account = await loadAccount(supabase, accountId)
  if (!account) return { planId: "expired", agentIds: [] }
  if (account.role === "admin") return { planId: "admin", agentIds: allAgentIds }

  const plan = await resolveAccountPlan(supabase, account, nowMs)
  if (plan.blocked || plan.id === "creator_free") return { planId: plan.id, agentIds: [] }

  let displayPlanIds: string[] = []
  const billing = await supabase.from("billing_accounts").select("display_plan_id").eq("account_id", accountId).maybeSingle()
  if (!billing.error && billing.data?.display_plan_id) {
    displayPlanIds = [String(billing.data.display_plan_id)]
  } else {
    const plans = await supabase.from("plans").select("id").eq("catalog_plan_id", plan.id)
    if (!plans.error) displayPlanIds = (plans.data || []).map((row: any) => String(row.id))
  }
  if (displayPlanIds.length === 0) return { planId: plan.id, agentIds: [] }

  let { data, error } = await supabase.from("plan_agents").select("agent_id, is_enabled").in("plan_id", displayPlanIds)
  if (error) ({ data, error } = await supabase.from("plan_agents").select("agent_id").in("plan_id", displayPlanIds))
  if (error) return { planId: plan.id, agentIds: [] }
  // Admin -> Plans can switch an agent off for a plan without deleting the row.
  data = (data || []).filter((row: any) => row.is_enabled !== false)
  const allowed = new Set(allAgentIds)
  const granted = new Set<string>((data || []).map((row: any) => String(row.agent_id)))
  return { planId: plan.id, agentIds: [...granted].filter((id) => allowed.has(id)) }
}
