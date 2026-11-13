"use client"

import React from "react"
import { useWorkspaceUsage } from "@/hooks/use-workspace-usage"
import { cn } from "@/lib/utils"

interface PlanCardProps {
  planName?: string
  renewsText?: string
  priceText?: string
  status?: string
  meters?: {
    aiReplies: { used: number; limit: number }
    channels: { used: number; limit: number }
    contacts: { used: number; limit: number }
    seats: { used: number; limit: number }
  }
  className?: string
}

function MeterItem({
  label,
  used,
  limit,
}: {
  label: string
  used: number
  limit: number
}) {
  const isUnlimited = limit === -1
  const ratio = isUnlimited ? 0 : limit > 0 ? used / limit : 0
  const isMaxed = ratio >= 1.0 && !isUnlimited

  const formattedUsed = new Intl.NumberFormat("en-US").format(used)
  const formattedLimit = isUnlimited ? "Unlimited" : new Intl.NumberFormat("en-US").format(limit)

  return (
    <div className="space-y-1.5">
      <p className="text-[11.5px] text-[var(--t3)] font-normal leading-none">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] font-bold font-mono text-[var(--t1)] tabular-nums leading-none">
          {formattedUsed}
        </span>
        <span className="text-[12px] font-mono text-[var(--t3)] tabular-nums leading-none">
          / {formattedLimit}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-[var(--s3)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isMaxed ? "bg-[var(--amber)]" : "bg-[var(--gold)]"
          )}
          style={{ width: `${Math.min(100, Math.max(isMaxed ? 100 : 4, Math.round(ratio * 100)))}%` }}
        />
      </div>
    </div>
  )
}

export function PlanCard({
  planName,
  renewsText,
  priceText,
  status = "Active",
  meters,
  className,
}: PlanCardProps) {
  const { usage, isLoading } = useWorkspaceUsage()

  // Use props if provided, otherwise real usage data from single source of truth
  const displayPlanName = planName || usage?.plan?.name || "Pro"
  const displayRenews = renewsText || usage?.plan?.renewsFormatted || "Renews 12 Nov"
  const displayPrice = priceText || usage?.plan?.priceFormatted || "EGP 1,450/mo"
  const displayStatus = status || usage?.plan?.status || "Active"

  const displayMeters = meters || {
    aiReplies: {
      used: usage?.used?.aiReplies ?? 8240,
      limit: usage?.limits?.aiReplies ?? 10000,
    },
    channels: {
      used: usage?.used?.channels ?? 3,
      limit: usage?.limits?.channels ?? 3,
    },
    contacts: {
      used: usage?.used?.contacts ?? 1912,
      limit: usage?.limits?.contacts ?? 5000,
    },
    seats: {
      used: usage?.used?.seats ?? 2,
      limit: usage?.limits?.seats ?? 5,
    },
  }

  if (isLoading && !meters) {
    return (
      <div className={cn("rounded-[14px] bg-[var(--s1)] border border-[var(--line)] p-4 sm:p-5 animate-pulse space-y-4", className)}>
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-24 bg-[var(--s3)] rounded-[4px]" />
            <div className="h-3 w-36 bg-[var(--s3)] rounded-[4px]" />
          </div>
          <div className="h-5 w-14 bg-[var(--s3)] rounded-[6px]" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 bg-[var(--s3)] rounded" />
              <div className="h-6 w-20 bg-[var(--s3)] rounded" />
              <div className="h-1 w-full bg-[var(--s3)] rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-[14px] bg-[var(--s1)] border border-[var(--line)] p-4 sm:p-5 select-none space-y-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-[20px] font-bold text-[var(--t1)] tracking-tight leading-none">
            {displayPlanName}
          </h3>
          <p className="text-[12px] text-[var(--t3)] leading-tight">
            {displayRenews} · {displayPrice}
          </p>
        </div>

        <span className="px-2 py-0.5 rounded-[6px] bg-[var(--goldbg)] border border-[var(--goldline)] text-[11px] font-semibold text-[var(--gold)] shrink-0 capitalize">
          {displayStatus}
        </span>
      </div>

      {/* 2x2 Grid of Meters */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
        <MeterItem
          label="AI replies"
          used={displayMeters.aiReplies.used}
          limit={displayMeters.aiReplies.limit}
        />
        <MeterItem
          label="Channels"
          used={displayMeters.channels.used}
          limit={displayMeters.channels.limit}
        />
        <MeterItem
          label="Contacts"
          used={displayMeters.contacts.used}
          limit={displayMeters.contacts.limit}
        />
        <MeterItem
          label="Seats"
          used={displayMeters.seats.used}
          limit={displayMeters.seats.limit}
        />
      </div>
    </div>
  )
}
