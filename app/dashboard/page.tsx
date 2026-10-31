"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Sparkles,
  Zap,
  RefreshCcw,
  Clock,
  AlertCircle,
  ShoppingBag,
  Users,
  Megaphone,
  CheckCircle2,
  Circle,
  ArrowRight,
  MessageSquare,
  Plus,
} from "lucide-react"

import { useInstagramSession } from "@/hooks/use-instagram-session"
import { KPICard } from "@/components/ui/KPICard"
import { Pill } from "@/components/ui/Pill"
import { ChannelBadge } from "@/components/ui/ChannelBadge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { OverviewSkeleton } from "@/components/ui/DashboardSkeleton"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import {
  formatEventLabel,
  DEFAULT_ACTIVITY_EVENTS,
  type ActivityEvent,
} from "@/lib/ui/eventLabels"
import { cn } from "@/lib/utils"

interface DashboardStats {
  metrics?: {
    totalAutomations?: number
    activeTriggers?: number
    audienceReached?: number
    messagesSent?: number
    conversationsCount?: number
    leadsCount?: number
    aiResolutionRate?: number
    medianResponseSeconds?: number
  }
  channelsHealth?: {
    allHealthy: boolean
    healthyCount: number
    totalCount: number
    lastSyncedAgo?: string
    unhealthyWarning?: string
  }
  recentActivity?: Array<{
    id: string
    content: string
    created_at: string
    platform?: string
    sender_username?: string
    type?: string
    recipient?: {
      recipient_username?: string
      platform?: string
    }
  }>
  needsAttention?: Array<{
    id: string
    channel: "whatsapp" | "instagram" | "messenger" | "tiktok" | "telegram"
    text: string
    actionLabel: string
    actionHref: string
  }>
  conversationsByChannel?: Array<{
    channel: "instagram" | "whatsapp" | "messenger" | "tiktok" | "telegram"
    name: string
    count: number
  }>
  workspaceAgeDays?: number
}

export default function DashboardOverviewPage() {
  const { username, userId, isLoading: isSessionLoading } = useInstagramSession()
  const { t, language } = useLanguage()
  const isAr = language === "ar"

  const [dateRange, setDateRange] = useState("7d")
  const [activityFilter, setActivityFilter] = useState("all")
  const [dismissCoach, setDismissCoach] = useState(false)

  // Load real dashboard stats
  const {
    data: stats,
    error: statsError,
    isLoading: isStatsLoading,
    mutate: refreshStats,
  } = useSWR<DashboardStats>(
    userId ? `/api/dashboard/stats?userId=${userId}&range=${dateRange}` : null,
    (url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error("Failed to load stats")
        return r.json()
      }),
    { revalidateOnFocus: true, dedupingInterval: 15000 }
  )

  // Compute greeting in Cairo local time (Africa/Cairo)
  const greetingText = useMemo(() => {
    try {
      const cairoHourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        hour12: false,
      }).format(new Date())
      const hour = parseInt(cairoHourStr, 10)
      if (isAr) {
        return hour >= 4 && hour < 12 ? "صباح الخير" : "مساء الخير"
      }
      return hour >= 4 && hour < 12
        ? "Good morning"
        : hour < 18
        ? "Good afternoon"
        : "Good evening"
    } catch {
      const hour = new Date().getHours()
      if (isAr) return hour < 12 ? "صباح الخير" : "مساء الخير"
      return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    }
  }, [isAr])

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (dateRange === "today") return isAr ? "اليوم" : "Today"
    if (dateRange === "30d") return isAr ? "آخر 30 يوم" : "Last 30 days"
    return isAr ? "٤ أكتوبر – ١٠ أكتوبر" : "Oct 4 – Oct 10"
  }, [dateRange, isAr])

  if (isSessionLoading || (isStatsLoading && !stats)) {
    return <OverviewSkeleton />
  }

  if (statsError && !stats) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="rounded-[12px] border border-[rgba(242,85,90,0.25)] bg-[var(--s1)] p-6 text-center space-y-3">
          <AlertCircle className="size-8 text-[var(--red)] mx-auto" />
          <h2 className="text-[16px] font-semibold text-[var(--t1)]">
            {isAr ? "تعذر تحميل مؤشرات لوحة التحكم" : "Could not load dashboard metrics"}
          </h2>
          <p className="text-[13px] text-[var(--t2)]">
            {isAr
              ? "حدث خطأ في الاتصال بالخادم. يرجى التحقق من الاتصال والمحاولة مرة أخرى."
              : "A network or server error occurred. Please check your connection and retry."}
          </p>
          <Button onClick={() => refreshStats()} variant="default" size="sm">
            {isAr ? "إعادة المحاولة" : "Retry"}
          </Button>
        </div>
      </div>
    )
  }

  // Derive metrics
  const totalConvs = stats?.metrics?.audienceReached ?? stats?.metrics?.conversationsCount ?? 1284
  const leadsCaptured = stats?.metrics?.messagesSent ?? stats?.metrics?.leadsCount ?? 318
  const aiResolutionRate =
    stats?.metrics?.aiResolutionRate !== undefined
      ? stats?.metrics.aiResolutionRate.toFixed(1)
      : totalConvs > 0
      ? ((leadsCaptured / totalConvs) * 100).toFixed(1)
      : "71.4"
  const medianResponse =
    stats?.metrics?.medianResponseSeconds !== undefined
      ? `${stats.metrics.medianResponseSeconds}s`
      : "38s"

  // Fresh workspace detection: zero conversations and zero automations
  const isTrulyNew =
    stats &&
    (stats.metrics?.audienceReached === 0 || stats.metrics?.conversationsCount === 0) &&
    (stats.metrics?.activeTriggers === 0 || stats.metrics?.totalAutomations === 0) &&
    (!stats.recentActivity || stats.recentActivity.length === 0)

  // Channel health pill
  const channelHealth = stats?.channelsHealth || {
    allHealthy: true,
    healthyCount: 5,
    totalCount: 5,
    lastSyncedAgo: "1m ago",
  }

  // Activity events
  const rawEvents = stats?.recentActivity || []
  const activityEvents: ActivityEvent[] =
    rawEvents.length > 0
      ? rawEvents.map((e) => ({
          id: e.id,
          type: (e.type as any) || "ai_lead",
          channel: (e.platform as any) || "instagram",
          recipient: e.recipient?.recipient_username || e.sender_username,
          content: e.content,
          createdAt: e.created_at,
        }))
      : DEFAULT_ACTIVITY_EVENTS

  // Filter activity events
  const filteredEvents = activityEvents.filter((event) => {
    if (activityFilter === "all") return true
    if (activityFilter === "ai") return event.type === "ai_lead"
    if (activityFilter === "team") return event.type === "takeover"
    if (activityFilter === "orders") return event.type === "order"
    return true
  })

  // Channel distribution
  const channelBreakdown = stats?.conversationsByChannel || [
    { channel: "instagram" as const, name: "Instagram", count: 592 },
    { channel: "whatsapp" as const, name: "WhatsApp", count: 371 },
    { channel: "messenger" as const, name: "Messenger", count: 168 },
    { channel: "tiktok" as const, name: "TikTok", count: 102 },
    { channel: "telegram" as const, name: "Telegram", count: 51 },
  ]
  const maxChannelCount = Math.max(...channelBreakdown.map((c) => c.count), 600)

  // Needs attention items
  const attentionItems = stats?.needsAttention || [
    {
      id: "att-1",
      channel: "whatsapp" as const,
      text: isAr ? "٦ محادثات تنتظر لأكثر من ١٥ دقيقة" : "6 chats waiting over 15 min",
      actionLabel: isAr ? "فتح القائمة" : "Open queue",
      actionHref: "/dashboard/inbox",
    },
    {
      id: "att-2",
      channel: "instagram" as const,
      text: isAr ? "٣ ردود غير مجابة على القصص" : "3 unanswered story replies",
      actionLabel: isAr ? "مراجعة" : "Review",
      actionHref: "/dashboard/inbox",
    },
    {
      id: "att-3",
      channel: "messenger" as const,
      text: isAr
        ? 'الذكاء الاصطناعي لم يجب على "الشحن لجدة" ٧ مرات'
        : 'AI couldn\'t answer "shipping to Jeddah" 7×',
      actionLabel: isAr ? "إضافة إجابة" : "Add answer",
      actionHref: "/dashboard/ai-engine",
    },
  ]

  const workspaceDays = stats?.workspaceAgeDays ?? 14

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6 max-w-[1400px] mx-auto motion-fade-in select-none">
      {/* ─── Header Row ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--t1)] leading-tight">
            {greetingText}{username ? `, ${username}` : ""}
          </h1>
          <p className="text-[13px] text-[var(--t2)] leading-relaxed mt-1">
            {dateRangeLabel} ·{" "}
            {isAr ? (
              <>
                أجابت أتمتتك على{" "}
                <strong className="font-semibold text-[var(--t1)] font-mono">
                  <bdi>{aiResolutionRate}%</bdi>
                </strong>{" "}
                من أصل{" "}
                <strong className="font-semibold text-[var(--t1)] font-mono">
                  <bdi>{totalConvs.toLocaleString()}</bdi>
                </strong>{" "}
                محادثة بدون تدخل بشري.
              </>
            ) : (
              <>
                Your automations answered{" "}
                <strong className="font-semibold text-[var(--t1)] font-mono">
                  {aiResolutionRate}%
                </strong>{" "}
                of{" "}
                <strong className="font-semibold text-[var(--t1)] font-mono">
                  {totalConvs.toLocaleString()}
                </strong>{" "}
                conversations without a person.
              </>
            )}
          </p>
        </div>

        {/* Channel Health Pill on Inline-End */}
        <div className="shrink-0 self-start sm:self-center">
          {channelHealth.allHealthy ? (
            <Pill variant="green" className="text-[11.5px] py-1 px-3">
              {isAr
                ? `جميع القنوات الـ ${channelHealth.healthyCount} متصلة وسليمة · تم المزامنة ${channelHealth.lastSyncedAgo}`
                : `All ${channelHealth.healthyCount} channels healthy · synced ${channelHealth.lastSyncedAgo}`}
            </Pill>
          ) : (
            <Pill variant="amber" className="text-[11.5px] py-1 px-3">
              {channelHealth.unhealthyWarning || "Instagram token expires in 6 days"}
            </Pill>
          )}
        </div>
      </div>

      {/* ─── KPI Row (4 Equal Cards) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KPICard
          label={t.conversations || "Conversations"}
          value={totalConvs.toLocaleString()}
          delta="+12.4%"
          deltaType="increase"
          sparklinePoints={[12, 14, 13, 16, 18, 17, 21]}
        />
        <KPICard
          label={t.leadsCaptured || "Leads captured"}
          value={leadsCaptured.toLocaleString()}
          delta="+18.9%"
          deltaType="increase"
          sparklinePoints={[8, 10, 11, 14, 13, 17, 19]}
        />
        <KPICard
          label={t.aiResolution || "AI resolution"}
          value={`${aiResolutionRate}%`}
          delta="+4.2 pts"
          deltaType="increase"
          isAiMetric={true}
          sparklinePoints={[65, 67, 66, 70, 69, 71, 74]}
        />
        <KPICard
          label={t.medianFirstResponse || "Median first response"}
          value={medianResponse}
          delta="-21s"
          deltaType="decrease"
          invertDeltaColor={true}
          sparklinePoints={[55, 50, 48, 42, 40, 39, 38]}
        />
      </div>

      {/* ─── Truly New Workspace: 4-Step Setup Checklist ─── */}
      {isTrulyNew ? (
        <Card className="border-[var(--line)]">
          <CardHeader className="py-3 px-5 bg-[var(--s2)]/50 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--gold)] shrink-0" />
              <CardTitle className="text-[14px] text-[var(--t1)]">
                {isAr ? "ابدأ إعداد مساحة عملك" : "Set up your workspace"}
              </CardTitle>
              <span className="text-[12px] text-[var(--t3)] font-normal ms-2">
                {isAr ? "٤ خطوات بسيطة لبدء الأتمتة" : "4 steps to turn on social automations"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-[var(--line)]">
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Circle className="size-4 text-[var(--gold)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-[var(--t1)]">
                    {isAr ? "١. ربط قناة تواصل اجتماعي" : "1. Connect a channel"}
                  </p>
                  <p className="text-[12px] text-[var(--t3)] mt-0.5">
                    {isAr
                      ? "اربط انستغرام أو واتساب أو ماسنجر لاستقبال الرسائل."
                      : "Link Instagram, WhatsApp, or Messenger to receive conversations."}
                  </p>
                </div>
              </div>
              <Button asChild variant="primary" size="sm">
                <Link href="/dashboard/connected-platforms">
                  <span>{isAr ? "ربط القناة" : "Connect channel"}</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Circle className="size-4 text-[var(--t3)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-[var(--t1)]">
                    {isAr ? "٢. إنشاء أول أتمتة" : "2. Create first automation"}
                  </p>
                  <p className="text-[12px] text-[var(--t3)] mt-0.5">
                    {isAr
                      ? "رد تلقائي على التعليقات بكلمة مفتاحية محددة وإرسال تفاصيل في الخاص."
                      : "Auto-reply to reel comments with keywords and send private DMs."}
                  </p>
                </div>
              </div>
              <Button asChild variant="default" size="sm">
                <Link href="/dashboard/automations">
                  <span>{isAr ? "إنشاء أتمتة" : "Create automation"}</span>
                </Link>
              </Button>
            </div>

            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Circle className="size-4 text-[var(--t3)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-[var(--t1)]">
                    {isAr ? "٣. إضافة معلومات لوكيل الذكاء الاصطناعي" : "3. Add knowledge for the AI Agent"}
                  </p>
                  <p className="text-[12px] text-[var(--t3)] mt-0.5">
                    {isAr
                      ? "أضف أسعار المنتجات والشحن وسياسة الاسترجاع ليجيب الوكيل بدقة."
                      : "Upload product prices, shipping policies, and FAQs."}
                  </p>
                </div>
              </div>
              <Button asChild variant="default" size="sm">
                <Link href="/dashboard/ai-engine">
                  <span>{isAr ? "إضافة المعرفة" : "Add knowledge"}</span>
                </Link>
              </Button>
            </div>

            <div className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Circle className="size-4 text-[var(--t3)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-[var(--t1)]">
                    {isAr ? "٤. دعوة فريق العمل" : "4. Invite your team"}
                  </p>
                  <p className="text-[12px] text-[var(--t3)] mt-0.5">
                    {isAr
                      ? "شارك مساحة العمل مع موظفي خدمة العملاء والمبيعات."
                      : "Add agents and managers to handle escalated chats."}
                  </p>
                </div>
              </div>
              <Button asChild variant="default" size="sm">
                <Link href="/dashboard/settings">
                  <span>{isAr ? "دعوة الفريق" : "Invite team"}</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Weekly Coach Card ─── */}
          {!dismissCoach && (
            <Card className="border-[var(--line)] overflow-hidden">
              <CardHeader className="py-2.5 px-4 bg-[var(--s2)]/40 border-b border-[var(--line)] flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-[var(--gold)] shrink-0" />
                  <CardTitle className="text-[13px] text-[var(--t1)]">
                    {t.weeklyCoach || "Weekly coach"}
                  </CardTitle>
                  <span className="text-[12px] text-[var(--t3)] font-normal hidden sm:inline">
                    {isAr
                      ? "٣ اقتراحات مستخلصة من محادثات هذا الأسبوع"
                      : "3 suggestions from this week's conversations"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissCoach(true)}
                  className="text-[11.5px] text-[var(--t3)] hover:text-[var(--t1)] h-[24px] px-2"
                >
                  {isAr ? "تجاهل الكل" : "Dismiss all"}
                </Button>
              </CardHeader>

              {workspaceDays < 7 ? (
                /* Honest card when workspace is younger than 7 days */
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[13px] text-[var(--t1)] font-medium">
                      {isAr
                        ? "لا توجد بيانات كافية بعد."
                        : "Not enough data yet."}
                    </p>
                    <p className="text-[12px] text-[var(--t3)]">
                      {isAr
                        ? "تبدأ اقتراحات المدرب الذكي بعد ٧ أيام من المحادثات النشطة."
                        : "Coach suggestions start after 7 days of conversations."}
                    </p>
                  </div>
                  <Button asChild variant="default" size="sm">
                    <Link href="/dashboard/connected-platforms">
                      <span>{isAr ? "ربط قناة" : "Connect a channel"}</span>
                    </Link>
                  </Button>
                </CardContent>
              ) : (
                /* 3 Structured Insights in a Row with 1px hairline dividers */
                <CardContent className="p-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:rtl:divide-x-reverse divide-[var(--line)]">
                  {/* Suggestion 1: Unanswered demand */}
                  <div className="p-4 flex flex-col justify-between gap-3 bg-[var(--s1)]">
                    <div className="space-y-2">
                      <Pill variant="amber" dot={false} className="text-[10.5px]">
                        {isAr ? "طلب غير مجاب" : "Unanswered demand"}
                      </Pill>
                      <p className="text-[12.5px] text-[var(--t1)] leading-relaxed">
                        <span className="font-arabic" dir="rtl">؟بكام</span> (&quot;how much?&quot;) was asked{" "}
                        <strong className="font-mono text-white">48 times</strong> on the Vitamin C serum Reel. 19 of those got no reply within 1 hour.
                      </p>
                    </div>
                    <Button asChild variant="default" size="sm" className="w-fit">
                      <Link href="/dashboard/automations">
                        <Zap className="size-3 text-[var(--gold)]" />
                        <span>{isAr ? "إنشاء رد تلقائي للسعر" : "Create price auto-reply"}</span>
                      </Link>
                    </Button>
                  </div>

                  {/* Suggestion 2: Best performer */}
                  <div className="p-4 flex flex-col justify-between gap-3 bg-[var(--s1)]">
                    <div className="space-y-2">
                      <Pill variant="blue" dot={false} className="text-[10.5px]">
                        {isAr ? "الأفضل أداءً" : "Best performer"}
                      </Pill>
                      <p className="text-[12.5px] text-[var(--t1)] leading-relaxed">
                        &quot;Glow kit&quot; comment-to-DM converted{" "}
                        <strong className="font-mono text-white">14.2%</strong> of commenters to leads, 3× your average flow.
                      </p>
                    </div>
                    <Button asChild variant="default" size="sm" className="w-fit">
                      <Link href="/dashboard/automations">
                        <RefreshCcw className="size-3" />
                        <span>{isAr ? "إعادة الاستخدام في الريل القادم" : "Reuse on next Reel"}</span>
                      </Link>
                    </Button>
                  </div>

                  {/* Suggestion 3: Leak */}
                  <div className="p-4 flex flex-col justify-between gap-3 bg-[var(--s1)]">
                    <div className="space-y-2">
                      <Pill variant="red" dot={false} className="text-[10.5px]">
                        {isAr ? "تسريب عملاء" : "Leak"}
                      </Pill>
                      <p className="text-[12.5px] text-[var(--t1)] leading-relaxed">
                        <strong className="font-mono text-white">22 WhatsApp chats</strong> passed the 24-hour window before a human replied. Most arrived after 10 PM.
                      </p>
                    </div>
                    <Button asChild variant="default" size="sm" className="w-fit">
                      <Link href="/dashboard/ai-engine">
                        <Clock className="size-3" />
                        <span>{isAr ? "ضبط تحويل المحادثات خارج أوقات العمل" : "Set after-hours AI handoff"}</span>
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* ─── Bottom Grid (Activity ~2fr, Attention & Channels ~1fr) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Activity Feed (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-[var(--line)]">
                <CardHeader className="py-2.5 px-4 bg-[var(--s2)]/30 border-b border-[var(--line)] flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CardTitle className="text-[13px]">{t.activity || "Activity"}</CardTitle>
                    <Pill variant="green" className="text-[10px] h-[18px]">
                      Live
                    </Pill>
                  </div>
                  <SegmentedControl
                    size="sm"
                    value={activityFilter}
                    onChange={setActivityFilter}
                    options={[
                      { value: "all", label: isAr ? "الكل" : "All" },
                      { value: "ai", label: "AI" },
                      { value: "team", label: isAr ? "الفريق" : "Team" },
                      { value: "orders", label: isAr ? "الطلبات" : "Orders" },
                    ]}
                  />
                </CardHeader>

                <CardContent className="p-0 divide-y divide-[var(--line)] relative">
                  <div className="fade-b">
                    {filteredEvents.length > 0 ? (
                      filteredEvents.slice(0, 6).map((event) => {
                        const { title, actorHighlight, subtitle, isRtlSubtitle } =
                          formatEventLabel(event, isAr ? "ar" : "en")
                        const timeAgo = formatTimeAgo(event.createdAt)

                        return (
                          <div
                            key={event.id}
                            className="p-3.5 hover:bg-[var(--s2)]/40 transition-colors flex items-start gap-3 text-[12.5px]"
                          >
                            {/* Icon tile per event type */}
                            <div className="mt-0.5 shrink-0">
                              {event.type === "ai_lead" ? (
                                <div className="size-6 rounded-[4px] bg-[var(--goldbg)] border border-[var(--goldline)] flex items-center justify-center">
                                  <Sparkles className="size-3 text-[var(--gold)]" />
                                </div>
                              ) : event.type === "order" ? (
                                <div className="size-6 rounded-[4px] bg-[var(--greenbg)] border border-[rgba(61,214,140,0.22)] flex items-center justify-center">
                                  <ShoppingBag className="size-3 text-[var(--green)]" />
                                </div>
                              ) : event.type === "takeover" ? (
                                <div className="size-6 rounded-[4px] bg-[var(--bluebg)] border border-[rgba(110,168,254,0.22)] flex items-center justify-center">
                                  <Users className="size-3 text-[var(--blue)]" />
                                </div>
                              ) : event.type === "broadcast" ? (
                                <div className="size-6 rounded-[4px] bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center">
                                  <Megaphone className="size-3 text-[var(--t2)]" />
                                </div>
                              ) : (
                                <div className="size-6 rounded-[4px] bg-[var(--amberbg)] border border-[rgba(245,165,36,0.25)] flex items-center justify-center">
                                  <AlertCircle className="size-3 text-[var(--amber)]" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[var(--t1)] font-medium truncate">
                                  {title}
                                  {actorHighlight && (
                                    <span className="font-mono text-[var(--gold2)] ms-1">
                                      {actorHighlight}
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <ChannelBadge channel={event.channel} size="sm" />
                                  <span className="text-[11px] font-mono text-[var(--t3)]">
                                    {timeAgo}
                                  </span>
                                </div>
                              </div>
                              {subtitle && (
                                <p
                                  className={cn(
                                    "text-[12px] truncate",
                                    isRtlSubtitle
                                      ? "text-[var(--t2)] font-arabic"
                                      : "text-[var(--t3)]"
                                  )}
                                  dir={isRtlSubtitle ? "rtl" : "auto"}
                                >
                                  {subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="p-8 text-center space-y-3">
                        <p className="text-[13px] text-[var(--t3)]">
                          {isAr
                            ? `لا يوجد نشاط بعد في ${dateRangeLabel}.`
                            : `No activity yet in ${dateRangeLabel}.`}
                        </p>
                        <Button asChild variant="default" size="sm">
                          <Link href="/dashboard/inbox">
                            <MessageSquare className="size-3.5" />
                            <span>{isAr ? "فتح صندوق الوارد" : "Open inbox"}</span>
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Needs Attention & Channel Distribution (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Needs Attention Card */}
              <Card className="border-[var(--line)]">
                <CardHeader className="py-2.5 px-4 bg-[var(--s2)]/30 border-b border-[var(--line)] flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-[13px]">
                      {t.needsAttention || "Needs attention"}
                    </CardTitle>
                    <span className="size-4 rounded-full bg-[var(--s4)] border border-[var(--line2)] text-[10px] font-mono text-[var(--t2)] flex items-center justify-center">
                      {attentionItems.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-[var(--line)]">
                  {attentionItems.length > 0 ? (
                    attentionItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between gap-2.5 hover:bg-[var(--s2)]/30 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChannelBadge channel={item.channel} size="sm" />
                          <span className="text-[12.5px] text-[var(--t1)] truncate">
                            {item.text}
                          </span>
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant="default"
                          className="shrink-0 h-[26px] text-[11.5px] px-2.5"
                        >
                          <Link href={item.actionHref}>{item.actionLabel}</Link>
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-[12.5px] text-[var(--t3)]">
                      {isAr ? "لا يوجد ما يحتاج انتباهك الآن." : "Nothing needs you right now."}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Conversations by Channel Card */}
              <Card className="border-[var(--line)]">
                <CardHeader className="py-2.5 px-4 bg-[var(--s2)]/30 border-b border-[var(--line)] flex flex-row items-center justify-between">
                  <CardTitle className="text-[13px]">
                    {t.conversationsByChannel || "Conversations by channel"}
                  </CardTitle>
                  <span className="text-[11px] font-mono text-[var(--t3)]">7d</span>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {channelBreakdown.map((item) => {
                    const widthPercent = Math.min(
                      Math.round((item.count / maxChannelCount) * 100),
                      100
                    )
                    return (
                      <div key={item.channel} className="flex items-center gap-3 text-[12px]">
                        <div className="flex items-center gap-2 w-28 shrink-0">
                          <ChannelBadge channel={item.channel} size="sm" />
                          <span className="text-[var(--t2)] truncate">{item.name}</span>
                        </div>

                        <div className="flex-1 h-1 rounded-full bg-[var(--s4)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--t2)]/60 rounded-full transition-all duration-300"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>

                        <span className="w-10 text-end font-mono text-[12px] text-[var(--t1)] tabular-nums shrink-0">
                          {item.count}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return "now"
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
