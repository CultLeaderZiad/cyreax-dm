"use client"

import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/fetcher"

interface Metric {
  metric: string
  used: number
  limit: number
  level: "ok" | "soft" | "hard"
  remaining: number | null
  message: string
}

const LABELS: Record<string, string> = {
  workspaces: "Workspaces",
  channels: "Channels",
  contacts: "Contacts",
  aiReplies: "AI replies this month",
  broadcasts: "Broadcasts this month",
  seats: "Team seats",
}

export default function UsagePage() {
  const usage = useSWR("/api/billing/usage", fetcher)
  const plan = usage.data?.plan
  const metrics: Metric[] = usage.data?.metrics || []

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Usage</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {plan ? `${plan.name} · ${usage.data?.status || "active"}` : "Plan limits are enforced on the server."}
        </p>
      </div>
      {usage.error && <p className="text-sm text-red-300">Usage could not be loaded.</p>}
      {usage.data?.migration_required && <p className="text-sm text-amber-200">Run the phase 7 SQL migration before meters can be stored.</p>}
      <div className="grid gap-3">
        {metrics.map((metric) => {
          const unlimited = metric.limit < 0
          const ratio = unlimited || metric.limit === 0 ? 0 : Math.min(1, metric.used / metric.limit)
          const tone = metric.level === "hard" || metric.remaining === 0 ? "bg-red-400" : metric.level === "soft" ? "bg-amber-300" : "bg-emerald-400"
          return (
            <section key={metric.metric} className="border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm text-white">{LABELS[metric.metric] || metric.metric}</h2>
                <span className="text-sm tabular-nums text-neutral-300">
                  {metric.used} / {unlimited ? "Unlimited" : metric.limit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full ${tone}`} style={{ width: unlimited ? "8%" : `${Math.round(ratio * 100)}%` }} />
              </div>
              {metric.message && <p className="text-xs text-amber-100">{metric.message}</p>}
            </section>
          )
        })}
      </div>
      <section className="border border-white/10 rounded-2xl p-4 text-sm text-neutral-300 space-y-2">
        <p>Soft warnings start at 80% of a limit. Creating another workspace, channel, contact, seat, broadcast, or AI reply past the limit is rejected.</p>
        <p>When the free trial ends you have 12 hours to subscribe; after that automations pause until a plan is paid. A subscription that is not renewed pauses at the end of its paid period.</p>
        <Link href="/dashboard/billing" className="inline-block text-white underline">Change plan</Link>
      </section>
    </div>
  )
}
