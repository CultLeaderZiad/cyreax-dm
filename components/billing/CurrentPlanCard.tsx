"use client"

import React, { useState } from "react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"

export interface CurrentPlanCardProps {
  planName?: string
  status?: "active" | "trialing" | "past_due" | "expired"
  renewsText?: string
  trialEndsAt?: string | null
  currency?: "EGP" | "SAR" | "USD"
  onAddWorkspaces?: () => void
  onChangePlan?: () => void
  onCancelSubscription?: () => void
}

export function CurrentPlanCard({
  planName = "Agency Growth",
  status = "active",
  renewsText = "Renews Nov 1 · EGP 11,900 / mo",
  trialEndsAt,
  currency = "EGP",
  onAddWorkspaces,
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

  // Price calculations based on currency
  const nextInvoiceText =
    currency === "SAR"
      ? "SAR 920 + 4 × 75 = SAR 1,220"
      : currency === "USD"
      ? "$249 + 4 × 20 = $329"
      : "EGP 11,900 + 4 × 950 = EGP 15,700"

  const nextInvoiceTotal =
    currency === "SAR"
      ? "SAR 1,220"
      : currency === "USD"
      ? "$329"
      : "EGP 15,700"

  const nextInvoiceFormula =
    currency === "SAR"
      ? "SAR 920 + 4 × 75 = "
      : currency === "USD"
      ? "$249 + 4 × 20 = "
      : "EGP 11,900 + 4 × 950 = "

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

        {/* 3 Progress Bars (4px bar height) */}
        <div className="space-y-3 pt-1">
          {/* Workspaces */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[var(--t2)] font-medium">Client workspaces</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--t1)]">
                <bdi>
                  14 / 10 · <span className="text-[var(--amber)]">4 extra</span>
                </bdi>
              </span>
            </div>
            <div className="h-[4px] rounded-full bg-[var(--s3)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--amber)] w-full" />
            </div>
          </div>

          {/* AI Replies */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[var(--t2)] font-medium">AI replies</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--t1)]">
                <bdi>8,240 / 12,000</bdi>
              </span>
            </div>
            <div className="h-[4px] rounded-full bg-[var(--s3)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--gold)] w-[68%]" />
            </div>
          </div>

          {/* Team Seats */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[var(--t2)] font-medium">Team seats</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--t1)]">
                <bdi>6 / 8</bdi>
              </span>
            </div>
            <div className="h-[4px] rounded-full bg-[var(--s3)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--t2)] w-[75%]" />
            </div>
          </div>
        </div>

        {/* Next invoice breakdown */}
        <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between text-[11.5px]">
          <span className="text-[var(--t3)]">Next invoice</span>
          <span className="font-mono font-medium text-[var(--t1)] tabular-nums">
            <bdi>
              {nextInvoiceFormula}
              <strong className="text-[var(--gold2)] font-semibold">
                {nextInvoiceTotal}
              </strong>
            </bdi>
          </span>
        </div>
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

          <Button
            variant="secondary"
            size="sm"
            onClick={
              onAddWorkspaces ||
              (() => toast.info("Add extra client workspaces (EGP 950 / client / mo)"))
            }
            className="h-[28px] px-2.5 text-[11.5px] font-medium"
          >
            Add workspaces
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
        title="Cancel Agency Subscription?"
        description="Your client workspaces, AI automations, and white-label settings remain active until the end of your billing cycle on Nov 1."
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep Subscription"
        loading={cancelling}
        variant="destructive"
        onConfirm={handleConfirmCancel}
      />
    </div>
  )
}
