"use client"

import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, ArrowUpRight, Info, Lock, Sparkles } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import type { Recommendation } from "@/lib/ai/recommendations/signals"

interface Batch {
  level: "weekly" | "daily"
  generatedAt: string
  summary: string | null
  items: Recommendation[]
}

const TONE = {
  high: { icon: AlertTriangle, ring: "border-[var(--red)]/30", dot: "text-[var(--red)]" },
  medium: { icon: AlertTriangle, ring: "border-[var(--gold)]/30", dot: "text-[var(--gold)]" },
  info: { icon: Info, ring: "border-[var(--line)]", dot: "text-[var(--t3)]" },
} as const

/** AI Recommendations: cards computed from the account's real data. */
export function AiRecommendations() {
  const { language } = useLanguage()
  const ar = language === "ar"
  const { data, error, isLoading } = useSWR<Batch & { error?: string; code?: string }>("/api/ai/recommendations", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false })

  if (isLoading) return <div className="h-32 rounded-xl border border-[var(--line)] bg-[var(--s1)] animate-pulse" />

  const locked = (error as any)?.status === 403 || data?.code === "FEATURE_NOT_IN_PLAN"
  if (locked) {
    return (
      <section className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 flex items-center gap-3">
        <Lock className="size-4 text-[var(--t3)] shrink-0" />
        <p className="text-[13px] text-[var(--t2)] flex-1">{ar ? "توصيات الذكاء الاصطناعي غير متاحة في خطتك." : "AI recommendations are not included in your plan."}</p>
        <Link href="/dashboard/billing" className="text-[12.5px] font-medium text-[var(--gold)] hover:underline">{ar ? "الخطط" : "See plans"}</Link>
      </section>
    )
  }
  if (error || !data?.items) return null

  return (
    <section aria-label={ar ? "توصيات الذكاء الاصطناعي" : "AI recommendations"} className="space-y-3 motion-fade-in-up">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--gold)]" />
        <h2 className="text-[14px] font-semibold text-[var(--t1)]">{ar ? "توصيات الذكاء الاصطناعي" : "AI recommendations"}</h2>
        <span className="text-[11px] text-[var(--t3)]">
          {data.level === "daily" ? (ar ? "تتحدث يوميًا" : "Updated daily") : ar ? "تتحدث أسبوعيًا" : "Updated weekly"}
        </span>
      </div>

      {data.summary && <p className="text-[13px] text-[var(--t2)] leading-relaxed max-w-3xl">{data.summary}</p>}

      {data.items.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 text-[13px] text-[var(--t2)]">
          {ar ? "لا توجد توصيات الآن: لا شيء يحتاج انتباهك بناءً على بياناتك." : "Nothing needs your attention right now, based on your data."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((item, i) => {
            const tone = TONE[item.severity]
            const Icon = tone.icon
            return (
              <Link
                key={item.key}
                href={item.action.href}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`group motion-fade-in-up rounded-xl border ${tone.ring} bg-[var(--s1)] p-4 flex flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--s2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gold)]`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`size-4 mt-0.5 shrink-0 ${tone.dot}`} />
                  <h3 className="text-[13.5px] font-semibold text-[var(--t1)] leading-snug">{ar ? item.title.ar : item.title.en}</h3>
                </div>
                <p className="text-[12.5px] text-[var(--t2)] leading-relaxed flex-1">{ar ? item.detail.ar : item.detail.en}</p>
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)]">
                  {ar ? item.action.label.ar : item.action.label.en}
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100" />
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
