"use client"

import React from "react"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface FunnelStep {
  label: string
  count: string
  percentage: string
  barWidth: string
  opacity: string
}

const defaultSteps: FunnelStep[] = [
  { label: "Comments", count: "2,940", percentage: "100%", barWidth: "100%", opacity: "opacity-95" },
  { label: "DM opened", count: "1,826", percentage: "62%", barWidth: "62%", opacity: "opacity-75" },
  { label: "Lead captured", count: "612", percentage: "21%", barWidth: "21%", opacity: "opacity-55" },
  { label: "Paid order", count: "148", percentage: "5%", barWidth: "5%", opacity: "opacity-40" },
]

export function ReelOrderFunnel({
  hasData = true,
  onFullInsights,
}: {
  hasData?: boolean
  onFullInsights?: () => void
}) {
  if (!hasData) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 select-none space-y-3 text-center">
        <h3 className="text-[13.5px] font-semibold text-[var(--t1)] tracking-tight">
          Reel → order funnel
        </h3>
        <p className="text-xs text-[var(--t3)] max-w-sm mx-auto">
          Funnel appears once comment-to-DM automations have 7 days of data.
        </p>
        <Link href="/dashboard/automations">
          <Button variant="secondary" size="sm" className="h-[28px] text-xs mt-1">
            Open automations
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 select-none space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13.5px] font-semibold text-[var(--t1)] tracking-tight">
            Reel → order funnel
          </h3>
          <p className="text-[11px] text-[var(--t3)] font-mono mt-0.5">
            Last 7 days · all agents
          </p>
        </div>

        <button
          type="button"
          onClick={onFullInsights}
          className="text-[11.5px] font-medium text-[var(--t3)] hover:text-[var(--t1)] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>Full insights</span>
          <ArrowRight className="w-3 h-3 text-[var(--t3)]" />
        </button>
      </div>

      {/* Funnel Steps */}
      <div className="space-y-3 pt-1">
        {defaultSteps.map((step) => (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[var(--t2)] font-medium">{step.label}</span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-[var(--t1)] font-semibold">{step.count}</span>
                <span className="text-[var(--t3)] w-8 text-end">{step.percentage}</span>
              </div>
            </div>

            {/* Gradient-free solid gold bar with decreasing opacity */}
            <div className="h-4 rounded-md bg-[var(--s2)] overflow-hidden">
              <div
                className={`h-full rounded-md bg-[var(--gold)] ${step.opacity} transition-all duration-500`}
                style={{ width: step.barWidth }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
