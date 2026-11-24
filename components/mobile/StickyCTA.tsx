"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface StickyCTAProps {
  targetPlanTitle?: string
  priceText?: string
  methodName?: string
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
}

export function StickyCTA({
  targetPlanTitle = "See plans",
  priceText = "",
  methodName = "Vodafone Cash",
  loading = false,
  disabled = false,
  onClick,
  className,
}: StickyCTAProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-30 bg-[var(--bg)]/95 backdrop-blur-md border-t border-[var(--line)] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] select-none space-y-2.5",
        className
      )}
    >
      {/* Summary Line */}
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-[var(--t2)] font-medium">{targetPlanTitle}</span>
        <span className="text-[var(--t1)] font-mono font-bold tabular-nums">
          {priceText}
        </span>
      </div>

      {/* Primary Gold CTA */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="w-full h-12 rounded-[12px] bg-[var(--gold)] hover:bg-[var(--gold2)] active:scale-[0.99] text-black font-semibold text-[14px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-black" />
        ) : (
          <span>Continue with {methodName}</span>
        )}
      </button>
    </div>
  )
}
