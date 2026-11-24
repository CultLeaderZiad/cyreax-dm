export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { PLAN_CATALOG, applyEntitlements, describeEntitlements } from "@/lib/billing/plans"

export async function GET() {
  try {
    const supabase = await getSupabaseBypassClient()
    const { data: plans, error } = await supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { data: planAgents } = await supabase
      .from("plan_agents")
      .select("plan_id, is_enabled, agents(id, name, category, icon)")

    const plansWithAgents = plans.map((plan: any) => {
        const activeAgents = planAgents?.filter((pa: any) => pa.plan_id === plan.id && pa.is_enabled)
            .map((pa: any) => pa.agents) || []
        // What the server enforces for this plan right now: the tier defaults
        // with the admin's overrides, and the lines customers read generated from it.
        const tier = PLAN_CATALOG.find((p) => p.id === plan.catalog_plan_id) || PLAN_CATALOG.find((p) => p.id === (plan.billing_cycle === "monthly" ? "creator" : "creator_plus"))!
        const effective = applyEntitlements(tier, plan.entitlements)
        return { ...plan, active_agents: activeAgents, effective_limits: effective.limits, feature_lines: describeEntitlements(effective.limits) }
    })

    return NextResponse.json(plansWithAgents)
  } catch (error: any) {
    console.error("[plans] Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

