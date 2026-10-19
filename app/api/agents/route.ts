export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { scopedAccountId, type AccountScopeMethod } from "@/lib/account-scope"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { getSessionUser } from "@/lib/auth"
import { listMemberships } from "@/lib/workspaces"

async function accountIdForAgentRequest(
  sessionAccountId: string,
  requestedAccountId: string | null | undefined,
  method: AccountScopeMethod,
): Promise<string | null> {
  const requested = typeof requestedAccountId === "string" ? requestedAccountId.trim() : ""
  if (!sessionAccountId) return null
  if (!requested || requested === sessionAccountId) return sessionAccountId
  const supabase = await getSupabaseBypassClient()
  const memberships = await listMemberships(supabase, sessionAccountId)
  return scopedAccountId(sessionAccountId, requested, memberships, method)
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Never trust a client-supplied accountId. Own account, or a workspace the caller belongs to.
    const accId = await accountIdForAgentRequest(user.id, req.nextUrl.searchParams.get("accountId"), "GET")
    if (!accId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const supabase = await getSupabaseBypassClient()
    
    // Fetch base data in parallel
    const [
      { data: agents, error: agentsError },
      { data: account },
      { data: settings, error: settingsError }
    ] = await Promise.all([
      supabase.from("agents").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("accounts").select("plan, role").eq("id", accId).maybeSingle(),
      supabase.from("account_agent_settings").select("agent_id, is_enabled, byok_provider, byok_connected_at, last_used_at").eq("account_id", accId)
    ]);

    if (agentsError) {
      if (agentsError.code === '42P01') {
        // Table doesn't exist yet, return empty list gracefully
        return NextResponse.json({ agents: [], plan_id: null })
      }
      throw new Error(agentsError.message)
    }

    // Get user's plan_agents mapping based on plan
    let planAgents: string[] = []
    
    if (account?.role === 'admin') {
      // Admins get all agents unlocked
      planAgents = agents?.map((a: any) => a.id) || []
    } else if (account?.plan) {
      // Paid users (monthly, one_time, yearly) get ALL agents unlocked by default
      // Only trial users are restricted to plan_agents table entries
      const paidPlans = ['monthly', 'one_time', 'yearly']
      if (paidPlans.includes(account.plan)) {
        planAgents = agents?.map((a: any) => a.id) || []
      } else {
        // Trial/free users: check plan_agents table
        const { data: pa, error: paError } = await supabase.from("plan_agents").select("agent_id").eq("plan_id", account.plan)
        if (pa && !paError) planAgents = pa.map((p: any) => p.agent_id)
      }
    }

    const settingsMap = (!settingsError && settings ? settings : []).reduce((acc: any, s: any) => {
      acc[s.agent_id] = s
      return acc
    }, {})

    // Merge everything.
    // Default is_enabled = TRUE when the account never configured the agent —
    // this matches the runtime behaviour of isAgentEnabled() (fail-open), so the
    // dashboard switch no longer shows OFF while the agent is actually running.
    const result = agents?.map((agent: any) => ({
      ...agent,
      is_unlocked: planAgents.includes(agent.id),
      settings: settingsMap[agent.id] || { is_enabled: true, is_default: true }
    })) || []

    return NextResponse.json({ agents: result, plan_id: account?.plan })
  } catch (error: any) {
    console.error("[api/agents] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { accountId, agentId, is_enabled, byok_key, byok_provider } = await req.json()
    const accId = await accountIdForAgentRequest(user.id, typeof accountId === "string" ? accountId : null, "PATCH")
    if (!accId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!agentId) return NextResponse.json({ error: "Missing ids" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()

    if (byok_key) {
      // Handling BYOK key via RPC
      const secret = process.env.BYOK_ENCRYPTION_SECRET
      if (!secret) throw new Error("BYOK_ENCRYPTION_SECRET is not configured on server.")
      
      const { error } = await supabase.rpc("set_agent_byok_key", {
        p_account_id: accId,
        p_agent_id: agentId,
        p_api_key: byok_key,
        p_provider: byok_provider || "unknown",
        p_secret: secret
      })

      if (error) throw new Error(error.message)
    } else if (is_enabled !== undefined) {
      // Just toggling on/off
      const { error } = await supabase
        .from("account_agent_settings")
        .upsert(
          { account_id: accId, agent_id: agentId, is_enabled },
          { onConflict: "account_id,agent_id" }
        )
      
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[api/agents] PATCH error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

