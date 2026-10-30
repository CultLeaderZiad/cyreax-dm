"use client"

import React, { useState, useEffect } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function NotificationsSettingsSection() {
  const { data, mutate } = useSWR("/api/notifications/settings", fetcher)

  const [leadAlerts, setLeadAlerts] = useState(true)
  const [handoffAlerts, setHandoffAlerts] = useState(true)
  const [lowBalanceAlerts, setLowBalanceAlerts] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.settings) {
      if (typeof data.settings.lead_alerts === "boolean") setLeadAlerts(data.settings.lead_alerts)
      if (typeof data.settings.handoff_alerts === "boolean") setHandoffAlerts(data.settings.handoff_alerts)
      if (typeof data.settings.low_balance_alerts === "boolean") setLowBalanceAlerts(data.settings.low_balance_alerts)
      if (typeof data.settings.weekly_digest === "boolean") setWeeklyDigest(data.settings.weekly_digest)
    }
  }, [data])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            email_alerts: true,
            lead_alerts: leadAlerts,
            handoff_alerts: handoffAlerts,
            low_balance_alerts: lowBalanceAlerts,
            weekly_digest: weeklyDigest,
          },
        }),
      })

      if (res.ok) {
        toast.success("Notification preferences saved")
        mutate()
      } else {
        toast.error("Failed to save notification preferences")
      }
    } catch {
      toast.error("Network error saving preferences")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Notifications
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Manage how and when the platform alerts you about messages, leads, and usage.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Email alerts
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Real-time notices delivered directly to your agency email inbox.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            {/* Toggle 1: New lead captured */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12.5px] font-medium text-[var(--t1)] block">
                  New lead captured
                </span>
                <span className="text-[11px] text-[var(--t3)] block">
                  Receive an instant notice when an Instagram or TikTok lead enters your CRM.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={leadAlerts}
                onClick={() => setLeadAlerts(!leadAlerts)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                  leadAlerts ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-full bg-black transition-transform",
                    leadAlerts ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Toggle 2: Human handoff alert */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12.5px] font-medium text-[var(--t1)] block">
                  AI handoff alert
                </span>
                <span className="text-[11px] text-[var(--t3)] block">
                  Alert your team when the AI agent pauses automated replies and requests human assistance.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={handoffAlerts}
                onClick={() => setHandoffAlerts(!handoffAlerts)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                  handoffAlerts ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-full bg-black transition-transform",
                    handoffAlerts ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Toggle 3: AI reply balance alert */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12.5px] font-medium text-[var(--t1)] block">
                  AI reply balance alert
                </span>
                <span className="text-[11px] text-[var(--t3)] block">
                  Alert your team when monthly AI replies reach 80% of current plan limit.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowBalanceAlerts}
                onClick={() => setLowBalanceAlerts(!lowBalanceAlerts)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                  lowBalanceAlerts ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-full bg-black transition-transform",
                    lowBalanceAlerts ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Toggle 4: Weekly performance summary */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12.5px] font-medium text-[var(--t1)] block">
                  Weekly performance summary
                </span>
                <span className="text-[11px] text-[var(--t3)] block">
                  A Monday digest summarizing all client conversations, conversions, and revenue.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={weeklyDigest}
                onClick={() => setWeeklyDigest(!weeklyDigest)}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                  weeklyDigest ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                )}
              >
                <span
                  className={cn(
                    "w-3 h-3 rounded-full bg-black transition-transform",
                    weeklyDigest ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={handleSave}
                className="h-[30px] px-4 text-xs font-semibold"
              >
                {saving ? "Saving..." : "Save preferences"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
