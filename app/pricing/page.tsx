import { CheckCircle, Zap, Star } from "lucide-react"
import Link from "next/link"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"

import PricingClient from "./PricingClient"

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  // A data hiccup must never blank the pricing page: fall back to the default plans.
  let dbPlans: any[] | null = null
  let error: unknown = null
  let planAgents: any[] | null = null
  try {
    const supabase = await getSupabaseBypassClient()
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

  const plans = (!error && dbPlans && dbPlans.length > 0) ? dbPlans.map((p: any) => {
    const agentsForPlan = planAgents
      ?.filter((pa: any) => pa.plan_id === p.id)
      .map((pa: any) => pa.agents?.name)
      .filter(Boolean) || []
    
    return {
      ...p,
      features: [...(p.features || []), ...agentsForPlan]
    }
  }) : [
    {
      id: "fallback-1",
      name: "Pro Plan",
      description: "Full access",
      price_usd: 9.99,
      price_yearly: 99.99,
      billing_cycle: "monthly",
      features: ["Unlimited automations", "Priority support"]
    },
    {
      id: "fallback-2",
      name: "Enterprise",
      description: "For large teams",
      billing_cycle: "enterprise",
      is_contact_sales: true,
      features: ["Custom integrations", "Dedicated account manager"]
    }
  ];

  return (
    <div className="min-h-screen bg-[#03010A] text-white flex flex-col justify-between selection:bg-[#e5a93c] selection:text-black relative">
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
