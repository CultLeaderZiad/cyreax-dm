"use client"

import React, { useState } from "react"
import { Pill } from "@/components/ui/Pill"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export interface PlansComparisonRowProps {
  currency?: "EGP" | "SAR" | "USD"
  currentPlanId?: string
  onSelectPlan?: (planId: string) => void
}

export function PlansComparisonRow({
  currency = "EGP",
  currentPlanId = "agency-growth",
  onSelectPlan,
}: PlansComparisonRowProps) {
  const [isAnnual, setIsAnnual] = useState(false)
  const router = useRouter()

  const formatPrice = (egp: number, sar: number, usd: number) => {
    const discountedEgp = Math.round(egp * (10 / 12))
    const discountedSar = Math.round(sar * (10 / 12))
    const discountedUsd = Math.round(usd * (10 / 12))

    if (currency === "SAR") {
      return isAnnual ? `SAR ${discountedSar}` : `SAR ${sar}`
    }
    if (currency === "USD") {
      return isAnnual ? `$${discountedUsd}` : `$${usd}`
    }
    return isAnnual
      ? `EGP ${discountedEgp.toLocaleString()}`
      : `EGP ${egp.toLocaleString()}`
  }

  const plans = [
    {
      id: "creator",
      slug: "creator",
      name: "Creator",
      price: formatPrice(690, 55, 15),
      isCurrent: currentPlanId === "creator",
      features: [
        "1 brand · all social channels",
        "Catalog + payment links",
        "500 AI replies",
      ],
    },
    {
      id: "creator-pro",
      slug: "creator_plus",
      name: "Creator Pro",
      price: formatPrice(1490, 115, 30),
      isCurrent: currentPlanId === "creator-pro" || currentPlanId === "creator_plus",
      features: [
        "Adds WhatsApp + broadcasts",
        "3 seats · 3,000 AI replies",
        "Arabic dialect agent",
      ],
    },
    {
      id: "agency-starter",
      slug: "agency_starter",
      name: "Agency Starter",
      price: formatPrice(5900, 460, 120),
      isCurrent: currentPlanId === "agency-starter" || currentPlanId === "agency_starter",
      features: [
        "3 client workspaces",
        "Client portal + reports",
        "Shared seats",
      ],
    },
    {
      id: "agency-growth",
      slug: "agency",
      name: "Agency Growth",
      price: formatPrice(11900, 920, 249),
      isCurrent: currentPlanId === "agency-growth" || currentPlanId === "agency",
      features: [
        "10 workspaces · white-label",
        "8 seats · 12,000 AI replies",
        "Bring your own AI key",
      ],
    },
  ]

  const handleCardClick = (plan: typeof plans[number]) => {
    if (plan.isCurrent) return
    if (onSelectPlan) {
      onSelectPlan(plan.id)
    } else {
      router.push(`/checkout/${plan.slug}?cycle=${isAnnual ? "yearly" : "monthly"}`)
    }
  }

  return (
    <section id="plans-section" aria-labelledby="plans-heading" className="space-y-4 select-none">
      {/* Header & Annual Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 id="plans-heading" className="text-[16px] font-semibold text-[var(--t1)]">
            Plans
          </h2>
          {process.env.NODE_ENV !== "production" && (
            <p className="text-[11.5px] text-[var(--t3)] font-mono">
              Prices are placeholders pending validation
            </p>
          )}
        </div>

        {/* Monthly vs Annual Segment */}
        <div className="flex items-center p-0.5 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] text-[11.5px]">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={cn(
              "px-2.5 py-1 rounded-[4px] font-medium transition-colors cursor-pointer",
              !isAnnual
                ? "bg-[var(--s3)] text-[var(--t1)]"
                : "text-[var(--t3)] hover:text-[var(--t2)]"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setIsAnnual(true)}
            className={cn(
              "px-2.5 py-1 rounded-[4px] font-medium transition-colors cursor-pointer",
              isAnnual
                ? "bg-[var(--s3)] text-[var(--t1)]"
                : "text-[var(--t3)] hover:text-[var(--t2)]"
            )}
          >
            Annual · 2 months free
          </button>
        </div>
      </div>

      {/* 4 Compact Plan Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => {
          const isCurrent = p.isCurrent
          return (
            <div
              key={p.id}
              role={isCurrent ? "region" : "button"}
              tabIndex={isCurrent ? undefined : 0}
              aria-label={isCurrent ? `${p.name} plan (Current)` : `Select ${p.name} plan`}
              onClick={() => handleCardClick(p)}
              onKeyDown={(e) => {
                if (!isCurrent && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  handleCardClick(p)
                }
              }}
              className={cn(
                "rounded-xl border p-4.5 flex flex-col justify-between space-y-4 transition-all text-start",
                isCurrent
                  ? "border-[var(--goldline)] bg-[var(--s2)] shadow-xs"
                  : "border-[var(--line)] bg-[var(--s1)] hover:border-[var(--line2)] hover:bg-[var(--s2)]/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]"
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[var(--t1)]">
                    {p.name}
                  </span>
                  {isCurrent && (
                    <Pill variant="gold" dot={false} className="text-[10px] h-4">
                      Current
                    </Pill>
                  )}
                </div>

                <div>
                  <span className="font-mono text-[20px] font-semibold text-[var(--t1)] tabular-nums">
                    <bdi>{p.price}</bdi>
                  </span>
                  <span className="text-[11px] text-[var(--t3)] font-mono ms-1">
                    /mo
                  </span>
                </div>

                {/* Features list */}
                <div className="space-y-1.5 text-[11.5px] text-[var(--t2)] pt-1">
                  {p.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[var(--t4)]">•</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status or Action */}
              <div className="pt-2">
                {isCurrent ? (
                  <div className="h-[28px] rounded-[6px] border border-[var(--goldline)] bg-[var(--goldbg)] text-[var(--gold2)] flex items-center justify-center text-[11.5px] font-medium">
                    Current plan
                  </div>
                ) : (
                  <div className="h-[28px] rounded-[6px] border border-[var(--line)] bg-[var(--s2)] text-[var(--t2)] group-hover:text-[var(--t1)] flex items-center justify-center text-[11.5px] font-medium transition-colors">
                    Upgrade to {p.name}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
