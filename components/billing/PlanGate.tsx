"use client"

import Link from "next/link"
import useSWR from "swr"
import { LogOut, RefreshCw } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { formatEgp, type DbPlan } from "@/components/billing/PlansComparisonRow"
import { Button } from "@/components/ui/button"

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
          <div className={`grid gap-4 ${plans.length >= 3 ? "md:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2" : ""}`}>
            {plans.map((plan) => {
              const egp = formatEgp(plan.price_egp)
              return (
                <div key={plan.id} className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 flex flex-col gap-4">
                  <div>
                    <h2 className="text-[15px] font-semibold">{plan.name}</h2>
                    <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums" dir="ltr">
                      ${plan.price_usd}
                      <span className="text-[11px] text-[var(--t3)] ms-1">{plan.billing_cycle === "lifetime" ? "once" : "/mo"}</span>
                    </p>
                    {egp && (
                      <p className="text-[11.5px] text-[var(--t3)]" dir="ltr">
                        In Egypt: {egp}
                      </p>
                    )}
                  </div>
                  <ul className="space-y-1 text-[12px] text-[var(--t2)] flex-1">
                    {[...new Set([...(plan.feature_lines || []), ...(plan.features || [])])].slice(0, 8).map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                  <Link
                    href={`/checkout/${encodeURIComponent(plan.id)}`}
                    className="h-[38px] rounded-[8px] bg-[var(--gold)] text-black font-semibold text-[13px] flex items-center justify-center hover:bg-[var(--gold2)] transition-colors"
                  >
                    Choose {plan.name}
                  </Link>
                </div>
              )
            })}
          </div>
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
