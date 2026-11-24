"use client"

import useSWR from "swr"
import { LogOut, RefreshCw } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { formatEgp, type DbPlan } from "@/components/billing/PlansComparisonRow"
import { Button } from "@/components/ui/button"
import { PlansGrid, normalizeApiPlans } from "@/components/pricing/PlansGrid"
import { TRIAL_PLAN_ID } from "@/lib/billing/plans"

/**
 * Shown instead of the dashboard when the free trial (or a paid period) has
 * ended. The customer has exactly two ways forward: pick a plan and pay, or
 * log out. Plans and prices come from Admin -> Plans.
 *
 * The server blocks the same accounts independently (lib/billing/enforce.ts),
 * so hiding this screen would not unlock anything.
 */
export function PlanGate({
  reason,
  onLogout,
  email,
}: {
  reason: "trial" | "subscription"
  onLogout: () => void
  email?: string | null
}) {
  const { data, error, isLoading } = useSWR<Array<DbPlan & { feature_lines?: string[] }>>("/api/plans", fetcher, {
    revalidateOnFocus: true,
  })
  const plans = Array.isArray(data) ? data.filter((plan) => !plan.is_contact_sales) : []

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--t1)] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {reason === "trial" ? "Your free trial has ended" : "Your subscription has ended"}
          </h1>
          <p className="text-[13.5px] text-[var(--t2)]">
            Your data is safe. Choose a plan to keep your automations and AI running, or log out.
          </p>
        </div>

        {isLoading ? (
          <div className="h-40 rounded-xl border border-[var(--line)] bg-[var(--s1)] animate-pulse" />
        ) : error || plans.length === 0 ? (
          <p role="status" className="text-center text-[13px] text-[var(--t3)] rounded-xl border border-[var(--line)] bg-[var(--s1)] p-6">
            Plans could not be loaded. Refresh in a moment, or contact support.
          </p>
        ) : (
          <PlansGrid plans={normalizeApiPlans(data)} featuredId={(plans.find((p) => (p as any).catalog_plan_id === TRIAL_PLAN_ID) || plans[Math.floor(plans.length / 2)])?.id} isAr={false} t={{}} mode="dashboard" />
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="size-3.5" /> I already paid, refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={onLogout} className="gap-2">
            <LogOut className="size-3.5" /> Log out{email ? ` (${email})` : ""}
          </Button>
        </div>
      </div>
    </div>
  )
}
