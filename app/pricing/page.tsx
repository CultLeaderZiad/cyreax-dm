import { CheckCircle, Zap, Star } from "lucide-react"
import Link from "next/link"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { syncWhopPricesIfStale } from "@/lib/billing/whop-price-sync"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"

import PricingClient from "./PricingClient"
import { PLAN_CATALOG, applyEntitlements, describeEntitlements } from "@/lib/billing/plans"

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  // A data hiccup must never blank the pricing page: fall back to the default plans.
  let dbPlans: any[] | null = null
  let error: unknown = null
  let planAgents: any[] | null = null
  try {
    const supabase = await getSupabaseBypassClient()
    await syncWhopPricesIfStale(supabase)
    const plansResult = await supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
    dbPlans = plansResult.data
    error = plansResult.error
    const agentsResult = await supabase
      .from("plan_agents")
      .select("plan_id, is_enabled, agents(name)")
      .eq("is_enabled", true)
    planAgents = agentsResult.data
  } catch (err) {
    console.error("[pricing] could not load plans:", err instanceof Error ? err.message : err)
    error = err
  }

  // Plans come only from the database (Admin -> Plans). If they cannot be
  // loaded the page says so; it never shows invented plans or prices.
  const plans = !error && dbPlans
    ? dbPlans.map((p: any) => {
        const agentsForPlan = planAgents
          ?.filter((pa: any) => pa.plan_id === p.id)
          .map((pa: any) => pa.agents?.name)
          .filter(Boolean) || []
        // Limits and features the server really enforces, generated, plus the
        // admin's own extra lines and the agents included in the plan.
        const tier = PLAN_CATALOG.find((c) => c.id === p.catalog_plan_id) || PLAN_CATALOG.find((c) => c.id === (p.billing_cycle === "monthly" ? "creator" : "creator_plus"))!
        const generated = p.is_contact_sales ? [] : describeEntitlements(applyEntitlements(tier, p.entitlements).limits)
        const features = [...generated, ...(p.features || []), ...agentsForPlan]
        const effective = applyEntitlements(tier, p.entitlements)
        return { ...p, features: [...new Set(features)], effective_limits: p.is_contact_sales ? null : effective.limits }
      })
    : []

  return (
    <div className="min-h-screen text-white flex flex-col justify-between selection:bg-[#e5a93c] selection:text-black relative">
      <FrontBackground />
      <div>
        <Header activeHref="/pricing" />
        <main className="max-w-7xl mx-auto pt-12 pb-24 px-6 relative z-10">
          <PricingClient plans={plans} />
        </main>
      </div>
      <Footer />
    </div>
  )
}
