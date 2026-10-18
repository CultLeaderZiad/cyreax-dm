"use client"

import { useState } from "react"
import {
  BarChart3,
  TrendingUp,
  Users,
  MessageCircle,
  Zap,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { AnalyticsDashboardView } from "@/components/dashboard/AnalyticsDashboardView"
import { cn } from "@/lib/utils"

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d")

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              Analytics & Insights
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              Real-time conversational metrics, AI resolution rates, and cross-channel funnel attribution.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--s1)] border border-[var(--line)]">
            {(["7d", "30d", "90d"] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={cn(
                  "h-7 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  timeRange === range
                    ? "bg-[var(--gold)] text-black font-semibold"
                    : "text-[var(--t3)] hover:text-[var(--t1)]"
                )}
              >
                {range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Core Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            {
              label: "Total Conversations",
              value: timeRange === "7d" ? "3,842" : timeRange === "30d" ? "14,920" : "42,100",
              change: "+18.4%",
              trend: "vs previous period",
              icon: MessageCircle,
            },
            {
              label: "AI Auto-Resolved",
              value: "71.4%",
              change: "+3.2%",
              trend: "No human handoff",
              icon: Sparkles,
            },
            {
              label: "Qualified Leads",
              value: timeRange === "7d" ? "612" : timeRange === "30d" ? "2,410" : "7,230",
              change: "+24.1%",
              trend: "Phone/email captured",
              icon: Users,
            },
            {
              label: "Avg. First Response",
              value: "3.4s",
              change: "-1.2s",
              trend: "99.8% uptime",
              icon: Zap,
            },
          ].map((metric, idx) => {
            const Icon = metric.icon
            return (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-2 hover:border-[var(--line3)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--t3)] font-medium">{metric.label}</span>
                  <div className="w-7 h-7 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)]">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-[var(--t1)] tabular-nums tracking-tight">
                  {metric.value}
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[var(--gold)] font-medium">{metric.change}</span>
                  <span className="text-[var(--t4)]">{metric.trend}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Funnel & Channel Breakdown Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          {/* Reel-to-Order Conversion Funnel */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--t1)]">Reel to Paid Order Funnel</h3>
                <p className="text-xs text-[var(--t3)]">Attribution from social comments to final checkout</p>
              </div>
              <span className="text-[11px] font-mono text-[var(--gold)]">7.8% Overall Conversion</span>
            </div>

            <div className="space-y-3 pt-1">
              {[
                { stage: "Comments on Automations", count: 2940, pct: "100%", fill: "w-full" },
                { stage: "DM Conversations Opened", count: 1826, pct: "62.1%", fill: "w-[62%]" },
                { stage: "Lead Captured (Contact / Cart)", count: 612, pct: "20.8%", fill: "w-[21%]" },
                { stage: "Completed Paid Orders", count: 228, pct: "7.8%", fill: "w-[8%]" },
              ].map((step, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--t2)]">{step.stage}</span>
                    <span className="font-mono tabular-nums text-[var(--t1)] font-semibold">
                      {step.count.toLocaleString()} ({step.pct})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--s2)] overflow-hidden">
                    <div className={cn("h-full bg-[var(--gold)] rounded-full transition-all duration-500", step.fill)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Channel Share */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--t1)]">Traffic by Channel</h3>

            <div className="space-y-3">
              {[
                { channel: "instagram" as ChannelType, label: "Instagram Direct", share: "58%", vol: "2,228 chats" },
                { channel: "whatsapp" as ChannelType, label: "WhatsApp Business", share: "26%", vol: "998 chats" },
                { channel: "facebook" as ChannelType, label: "Facebook Messenger", share: "12%", vol: "460 chats" },
                { channel: "telegram" as ChannelType, label: "Telegram Bot", share: "4%", vol: "156 chats" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--s2)]/40 border border-[var(--line)] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <ChannelBadge channel={item.channel} size="sm" />
                    <span className="font-medium text-[var(--t1)]">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[var(--t3)]">
                    <span>{item.vol}</span>
                    <span className="font-bold text-[var(--gold)]">{item.share}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Performance Insights & Comment Themes View */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
          <AnalyticsDashboardView />
        </div>
      </div>
    </div>
  )
}
