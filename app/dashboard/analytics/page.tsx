"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  MessageCircle,
  Users,
  ShoppingBag,
  CreditCard,
  RotateCcw,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { AnalyticsDashboardView } from "@/components/dashboard/AnalyticsDashboardView"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { fetcher } from "@/lib/fetcher"
import { formatCurrencyAmount } from "@/lib/analytics/funnel"
import { cn } from "@/lib/utils"

interface FunnelStage {
  id: "comments" | "conversations" | "leads" | "orders"
  name: string
  count: number
  pctOfTop: number
  conversionFromPrevious: number
  dropoffRate: number
}

interface ChannelStat {
  channel: string
  count: number
  total_cents: number
  sharePct: number
}

interface RevenueAnalyticsData {
  days: 7 | 30 | 90
  stages: {
    comments: number
    conversations: number
    leads: number
    orders: number
  }
  funnel: {
    overallConversion: number
    stages: FunnelStage[]
  }
  revenue: {
    primary: {
      currency: string
      total_cents: number
    }
    byCurrency: Record<string, { total_cents: number; count: number }>
  }
  byChannel: ChannelStat[]
  previous: {
    stages: {
      comments: number
      conversations: number
      leads: number
      orders: number
    }
    revenue: {
      primary: {
        currency: string
        total_cents: number
      }
    }
  }
  deltas: {
    comments: { percent: number; formatted: string; direction: "increase" | "decrease" | "neutral" }
    conversations: { percent: number; formatted: string; direction: "increase" | "decrease" | "neutral" }
    leads: { percent: number; formatted: string; direction: "increase" | "decrease" | "neutral" }
    orders: { percent: number; formatted: string; direction: "increase" | "decrease" | "neutral" }
    revenue: { percent: number; formatted: string; direction: "increase" | "decrease" | "neutral" }
  }
}

export default function AnalyticsPage() {
  const { language, t } = useLanguage()
  const isAr = language === "ar"
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d")
  const days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30

  const { data, error, isLoading, mutate } = useSWR<RevenueAnalyticsData>(
    `/api/analytics/revenue?days=${days}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )

  const currency = data?.revenue?.primary?.currency || "EGP"
  const totalCents = data?.revenue?.primary?.total_cents || 0
  const formattedRevenue = formatCurrencyAmount(totalCents, currency, isAr ? "ar" : "en")

  const deltaRevenue = data?.deltas?.revenue?.formatted || "0%"
  const deltaRevenueDir = data?.deltas?.revenue?.direction || "neutral"

  const deltaSuffix = isAr
    ? `مقارنة بـ ${days} يوماً السابقة`
    : `vs previous ${days} days`

  const hasAnyOrders = (data?.stages?.orders || 0) > 0 || totalCents > 0
  const hasAnyFunnelActivity =
    (data?.stages?.comments || 0) > 0 ||
    (data?.stages?.conversations || 0) > 0 ||
    (data?.stages?.leads || 0) > 0 ||
    hasAnyOrders

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              {isAr ? "التحليلات والمؤشرات" : "Analytics & insights"}
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              {isAr
                ? "مؤشرات المحادثات المباشرة، نسب إتمام الذكاء الاصطناعي، وتتبع قمع الإيرادات عبر القنوات."
                : "Real-time conversational metrics, AI resolution rates, and cross-channel funnel attribution."}
            </p>
          </div>

          {/* Time range selector */}
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
                {range === "7d"
                  ? isAr ? "آخر 7 أيام" : "Last 7 days"
                  : range === "30d"
                  ? isAr ? "آخر 30 يوماً" : "Last 30 days"
                  : isAr ? "آخر 90 يوماً" : "Last 90 days"}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Core Metric Cards with real API data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Conversations */}
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--t3)] font-medium">
                {isAr ? "المحادثات الخاصة" : "Conversations"}
              </span>
              <div className="size-7 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t2)]">
                <MessageCircle className="size-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--t1)] tabular-nums tracking-tight">
              {isLoading ? (
                <div className="h-7 w-20 bg-[var(--s2)] rounded animate-pulse" />
              ) : (
                (data?.stages?.conversations ?? 0).toLocaleString()
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={cn(
                  "font-medium",
                  data?.deltas?.conversations?.direction === "increase"
                    ? "text-[var(--green)]"
                    : data?.deltas?.conversations?.direction === "decrease"
                    ? "text-[var(--red)]"
                    : "text-[var(--t3)]"
                )}
              >
                {data?.deltas?.conversations?.formatted ?? "0%"}
              </span>
              <span className="text-[var(--t4)]">{deltaSuffix}</span>
            </div>
          </div>

          {/* 2. Qualified Leads */}
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--t3)] font-medium">
                {isAr ? "العملاء المؤهلون" : "Qualified leads"}
              </span>
              <div className="size-7 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t2)]">
                <Users className="size-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--t1)] tabular-nums tracking-tight">
              {isLoading ? (
                <div className="h-7 w-16 bg-[var(--s2)] rounded animate-pulse" />
              ) : (
                (data?.stages?.leads ?? 0).toLocaleString()
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={cn(
                  "font-medium",
                  data?.deltas?.leads?.direction === "increase"
                    ? "text-[var(--green)]"
                    : data?.deltas?.leads?.direction === "decrease"
                    ? "text-[var(--red)]"
                    : "text-[var(--t3)]"
                )}
              >
                {data?.deltas?.leads?.formatted ?? "0%"}
              </span>
              <span className="text-[var(--t4)]">{deltaSuffix}</span>
            </div>
          </div>

          {/* 3. Paid Orders */}
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--t3)] font-medium">
                {isAr ? "الطلبات المدفوعة" : "Paid orders"}
              </span>
              <div className="size-7 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t2)]">
                <Package className="size-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--t1)] tabular-nums tracking-tight">
              {isLoading ? (
                <div className="h-7 w-16 bg-[var(--s2)] rounded animate-pulse" />
              ) : (
                (data?.stages?.orders ?? 0).toLocaleString()
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={cn(
                  "font-medium",
                  data?.deltas?.orders?.direction === "increase"
                    ? "text-[var(--green)]"
                    : data?.deltas?.orders?.direction === "decrease"
                    ? "text-[var(--red)]"
                    : "text-[var(--t3)]"
                )}
              >
                {data?.deltas?.orders?.formatted ?? "0%"}
              </span>
              <span className="text-[var(--t4)]">{deltaSuffix}</span>
            </div>
          </div>

          {/* 4. Total Revenue */}
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--t3)] font-medium">
                {t.totalRevenue || (isAr ? "إجمالي الإيرادات" : "Total revenue")}
              </span>
              <div className="size-7 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t2)]">
                <CreditCard className="size-3.5" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--t1)] tabular-nums tracking-tight">
              {isLoading ? (
                <div className="h-7 w-24 bg-[var(--s2)] rounded animate-pulse" />
              ) : (
                formattedRevenue
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={cn(
                  "font-medium",
                  deltaRevenueDir === "increase"
                    ? "text-[var(--green)]"
                    : deltaRevenueDir === "decrease"
                    ? "text-[var(--red)]"
                    : "text-[var(--t3)]"
                )}
              >
                {deltaRevenue}
              </span>
              <span className="text-[var(--t4)]">{deltaSuffix}</span>
            </div>
          </div>
        </div>

        {/* Funnel & Channel Breakdown Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          {/* Reel-to-Order Conversion Funnel */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--t1)]">
                  {t.revenueFunnelTitle || (isAr ? "قمع التحويل من الريلز إلى الطلبات المدفوعة" : "Reel to Paid Order Funnel")}
                </h2>
                <p className="text-xs text-[var(--t3)] mt-0.5">
                  {t.revenueFunnelDesc || (isAr ? "تتبع التحويل من التعليقات إلى إتمام الدفع" : "Attribution from social comments to final checkout")}
                </p>
              </div>
              {!isLoading && !error && (
                <span className="text-xs font-mono text-[var(--t2)] font-medium">
                  {data?.funnel?.overallConversion ?? 0}% {t.overallConversion || (isAr ? "نسبة التحويل الإجمالية" : "Overall conversion")}
                </span>
              )}
            </div>

            {/* Error state */}
            {error && (
              <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--s2)]/40 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-[var(--red)]">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{t.revenueLoadError || (isAr ? "تعذر تحميل بيانات الإيرادات" : "Failed to load revenue data")}</span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => mutate()} className="h-7 text-xs">
                  <RotateCcw className="size-3 me-1.5" />
                  <span>{t.retry || (isAr ? "إعادة المحاولة" : "Retry")}</span>
                </Button>
              </div>
            )}

            {/* Skeleton loading state */}
            {isLoading && (
              <div className="space-y-3 pt-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="h-3.5 w-32 bg-[var(--s2)] rounded animate-pulse" />
                      <div className="h-3.5 w-16 bg-[var(--s2)] rounded animate-pulse" />
                    </div>
                    <div className="h-2 rounded-full bg-[var(--s2)] animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state: No orders yet */}
            {!isLoading && !error && !hasAnyFunnelActivity && (
              <div className="py-8 px-4 rounded-lg border border-dashed border-[var(--line2)] text-center space-y-3">
                <div className="size-10 rounded-full bg-[var(--s2)] border border-[var(--line)] mx-auto flex items-center justify-center text-[var(--t3)]">
                  <ShoppingBag className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--t1)]">
                    {t.noOrdersYet || (isAr ? "لا توجد طلبات بعد — اربط كتالوج المنتجات" : "No orders yet — connect a catalog")}
                  </p>
                  <p className="text-xs text-[var(--t3)] max-w-sm mx-auto">
                    {t.noOrdersYetDesc ||
                      (isAr
                        ? "اربط كتالوج المنتجات أو استقبل المدفوعات في المحادثات لتتبع الطلبات والإيرادات."
                        : "Connect your catalog or accept payments through chat to track paid orders and revenue.")}
                  </p>
                </div>
                <Button asChild variant="secondary" size="sm" className="mt-2 h-8 text-xs">
                  <Link href="/dashboard/catalog">
                    <span>{t.connectCatalog || (isAr ? "فتح إعدادات الكتالوج" : "Open catalog settings")}</span>
                    <ArrowUpRight className="size-3.5 ms-1.5" />
                  </Link>
                </Button>
              </div>
            )}

            {/* Funnel rows */}
            {!isLoading && !error && hasAnyFunnelActivity && (
              <div className="space-y-3 pt-1">
                {(data?.funnel?.stages || []).map((step) => {
                  const label =
                    step.id === "comments"
                      ? t.commentsStage || (isAr ? "تعليقات على الأتمتة" : "Comments on automations")
                      : step.id === "conversations"
                      ? t.conversationsStage || (isAr ? "محادثات خاصة بدأت" : "DM conversations opened")
                      : step.id === "leads"
                      ? t.leadsStage || (isAr ? "عملاء محتملون (إيميل / هاتف / طلب)" : "Leads captured (email/phone/order)")
                      : t.paidOrdersStage || (isAr ? "طلبات مدفوعة مكتملة" : "Completed paid orders")

                  return (
                    <div key={step.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--t2)]">{label}</span>
                        <span className="font-mono tabular-nums text-[var(--t1)] font-medium">
                          {step.count.toLocaleString()} ({step.pctOfTop}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--s2)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--gold)] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(Math.max(step.pctOfTop, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Channel Share */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--t1)]">
              {t.trafficByChannel || (isAr ? "الزيارات حسب القناة" : "Traffic by channel")}
            </h2>

            {/* Skeleton loading */}
            {isLoading && (
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-[var(--s2)] animate-pulse" />
                ))}
              </div>
            )}

            {/* Channels list */}
            {!isLoading && (
              <div className="space-y-2.5">
                {(data?.byChannel || [])
                  .filter((item) => item.count > 0 || (data?.byChannel?.every((c) => c.count === 0) && ["instagram", "whatsapp", "facebook", "telegram"].includes(item.channel)))
                  .slice(0, 5)
                  .map((item) => {
                    const label =
                      item.channel === "instagram"
                        ? "Instagram Direct"
                        : item.channel === "whatsapp"
                        ? "WhatsApp Business"
                        : item.channel === "facebook"
                        ? "Facebook Messenger"
                        : item.channel === "telegram"
                        ? "Telegram Bot"
                        : item.channel === "tiktok"
                        ? "TikTok"
                        : "Website Chat"

                    const formattedChannelRevenue = formatCurrencyAmount(
                      item.total_cents,
                      currency,
                      isAr ? "ar" : "en"
                    )

                    return (
                      <div
                        key={item.channel}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--s2)]/40 border border-[var(--line)] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ChannelBadge channel={item.channel as ChannelType} size="sm" />
                          <span className="font-medium text-[var(--t1)] truncate">{label}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[var(--t3)] shrink-0">
                          <span>
                            {item.count} {isAr ? "طلب" : item.count === 1 ? "order" : "orders"}
                          </span>
                          {item.total_cents > 0 && (
                            <span className="text-[var(--t2)] font-medium">
                              · {formattedChannelRevenue}
                            </span>
                          )}
                          <span className="font-semibold text-[var(--t1)] ms-1">
                            {item.sharePct}%
                          </span>
                        </div>
                      </div>
                    )
                  })}

                {(data?.byChannel || []).every((c) => c.count === 0) && (
                  <p className="text-xs text-[var(--t4)] text-center py-4">
                    {t.noTrafficYet || (isAr ? "لا توجد زيارات مسجلة في هذه الفترة" : "No channel traffic recorded in this period")}
                  </p>
                )}
              </div>
            )}
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
