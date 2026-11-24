"use client"

import React, { useState } from "react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

export interface PlanMetric {
  metric: string
  used: number
  limit: number
  level?: string
}

export interface CurrentPlanCardProps {
  /** Real plan name (plans.name, or the entitlement plan's name). */
  planName: string
  status?: "active" | "trialing" | "past_due" | "expired"
  /** e.g. "Renews Dec 1" / "Lifetime"; empty when unknown. */
  renewsText?: string
  /** e.g. "EGP 1,450 / mo" from the plans table; null when the plan has no EGP price. */
  priceText?: string | null
  trialEndsAt?: string | null
  /** Real usage from /api/billing/usage. */
  metrics?: PlanMetric[]
  /** Formatted end of the paid period, for the cancel dialog. */
  periodEndLabel?: string | null
  onChangePlan?: () => void
  onCancelSubscription?: () => void
}

const METRIC_LABEL: Record<string, string> = {
  workspaces: "Client workspaces",
  aiReplies: "AI replies",
  seats: "Team seats",
  channels: "Channels",
  contacts: "Contacts",
  broadcasts: "Broadcasts",
}
const SHOWN_METRICS = ["workspaces", "aiReplies", "seats"]

export function CurrentPlanCard({
  planName,
  status = "active",
  renewsText = "",
  priceText = null,
  trialEndsAt,
  metrics = [],
  periodEndLabel = null,
  onChangePlan,
  onCancelSubscription,
}: CurrentPlanCardProps) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const handleConfirmCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(
          data.message ||
            "Subscription canceled. It stays active until the end of the paid period."
        )
        if (onCancelSubscription) onCancelSubscription()
      } else {
        toast.error(data.error || "Failed to cancel subscription")
      }
    } catch {
      toast.error("Network error while scheduling cancellation")
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 select-none space-y-4 flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--t1)]">
              {planName}
            </h3>
            {status === "active" && (
              <Pill variant="green" dot>
                Active
              </Pill>
            )}
            {status === "trialing" && (
              <Pill variant="amber" dot>
                {trialEndsAt ? `Trial · ends ${trialEndsAt}` : "Trial"}
              </Pill>
            )}
            {status === "past_due" && (
              <Pill variant="red" dot>
                Past due
              </Pill>
            )}
            {status === "expired" && (
              <Pill variant="red" dot>
                Expired
              </Pill>
            )}
          </div>
          <span className="font-mono text-[11px] text-[var(--t3)]">
            <bdi>{renewsText}</bdi>
          </span>
        </div>

        {/* Trial copy notice if in trial */}
        {status === "trialing" && (
          <p className="text-[12px] text-[var(--amber)] bg-[var(--amberbg)] border border-[rgba(245,165,36,0.25)] rounded-[6px] p-2.5">
            You&apos;re on the free trial until {trialEndsAt || "the end of your trial"}. Choose a plan to keep automations running.
          </p>
        )}

        {/* Usage from the server; no placeholder numbers. */}
        {metrics.filter((m) => SHOWN_METRICS.includes(m.metric)).length > 0 && (
          <div className="space-y-3 pt-1">
            {metrics
              .filter((m) => SHOWN_METRICS.includes(m.metric))
              .map((m) => {
                const unlimited = m.limit < 0
                const pct = unlimited || m.limit === 0 ? 0 : Math.min(100, Math.round((m.used / m.limit) * 100))
                const over = !unlimited && m.limit > 0 && m.used > m.limit
                return (
                  <div key={m.metric} className="space-y-1">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-[var(--t2)] font-medium">{METRIC_LABEL[m.metric] || m.metric}</span>
                      <span className="font-mono text-[11px] tabular-nums text-[var(--t1)]">
                        <bdi>
                          {new Intl.NumberFormat("en-US").format(m.used)} / {unlimited ? "∞" : new Intl.NumberFormat("en-US").format(m.limit)}
                        </bdi>
                      </span>
                    </div>
                    {!unlimited && (
                      <div className="h-[4px] rounded-full bg-[var(--s3)] overflow-hidden">
                        <div
                          className={over ? "h-full rounded-full bg-[var(--amber)]" : "h-full rounded-full bg-[var(--gold)]"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}

        {priceText && (
          <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between text-[11.5px]">
            <span className="text-[var(--t3)]">Plan price</span>
            <span className="font-mono font-medium text-[var(--gold2)] tabular-nums">
              <bdi>{priceText}</bdi>
            </span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={
              onChangePlan ||
              (() => {
                const el = document.getElementById("plans-section")
                if (el) el.scrollIntoView({ behavior: "smooth" })
                else toast.info("Select a plan below to upgrade or modify your subscription")
              })
            }
            className="h-[28px] px-3 text-[11.5px] font-medium"
          >
            Change plan
          </Button>

        </div>

        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="text-[11.5px] text-[var(--t3)] hover:text-[var(--red)] transition-colors cursor-pointer"
        >
          Cancel subscription
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${planName}?`}
        description={
          periodEndLabel
            ? `Everything stays active until the end of your paid period on ${periodEndLabel}.`
            : "Everything stays active until the end of your paid period."
        }
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep Subscription"
        loading={cancelling}
        variant="destructive"
        onConfirm={handleConfirmCancel}
      />
    </div>
  )
}
