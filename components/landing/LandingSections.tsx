"use client"

import Link from "next/link"
import useSWR from "swr"
import { ArrowRight, Bot, CheckCircle2, Plug, Rocket, Workflow } from "lucide-react"
import { ChannelBadge } from "@/components/ui/ChannelBadge"
import { PlansGrid, normalizeApiPlans } from "@/components/pricing/PlansGrid"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { Reveal, SpotlightCard } from "@/components/landing/motion"
import { fetcher } from "@/lib/fetcher"
import { TRIAL_DAYS, TRIAL_PLAN_ID } from "@/lib/billing/plans"

/** The channels the product really connects to. */
const CHANNELS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "tiktok", label: "TikTok" },
] as const

export function ChannelsStrip({ isAr }: { isAr: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      <p className="font-mono-ui text-[11px] uppercase tracking-[0.2em] text-neutral-500">{isAr ? "يعمل مع" : "Works with"}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {CHANNELS.map((channel) => (
          <span key={channel.id} className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-neutral-200 transition-colors hover:border-white/25 hover:bg-white/[0.06]">
            <ChannelBadge channel={channel.id} size="sm" />
            {channel.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HowItWorks({ isAr }: { isAr: boolean }) {
  const steps = [
    { icon: Plug, title: isAr ? "اربط قنواتك" : "Connect your channels", desc: isAr ? "اربط إنستغرام وفيسبوك وواتساب وتيليجرام وتيك توك من لوحة واحدة، بدون كود." : "Link Instagram, Facebook, WhatsApp, Telegram and TikTok from one dashboard. No code." },
    { icon: Workflow, title: isAr ? "ابنِ أتمتتك" : "Build your automations", desc: isAr ? "حدد الكلمة المفتاحية أو المنشور، واكتب الرد أو اترك الذكاء الاصطناعي يجيب بصوت علامتك." : "Pick the keyword or post, write the reply, or let AI answer in your brand's voice." },
    { icon: Rocket, title: isAr ? "انمُ بتوصيات حقيقية" : "Grow with real insight", desc: isAr ? "توصيات يومية محسوبة من بياناتك الفعلية، ومساعد نمو يقترح ولا ينفذ إلا بموافقتك." : "Daily recommendations computed from your own data, and a Growth Agent that suggests and only acts when you confirm." },
  ]
  return (
    <section id="steps" className="mx-auto max-w-6xl px-5 py-20 md:px-10">
      <Reveal>
        <div className="mb-12 text-center">
          <span className="mb-3 block font-mono-ui text-xs font-semibold uppercase tracking-[0.2em] text-[#e5a93c]">{isAr ? "كيف يعمل" : "How it works"}</span>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">{isAr ? "من الربط إلى النمو في ثلاث خطوات" : "From connected to growing in three steps"}</h2>
        </div>
      </Reveal>
      <div className="relative grid gap-5 md:grid-cols-3">
        <div aria-hidden="true" className="absolute inset-x-[16%] top-[3.4rem] hidden h-px bg-gradient-to-r from-transparent via-[#e5a93c]/40 to-transparent md:block" />
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 120}>
            <SpotlightCard className="h-full p-7">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-xl border border-[#e5a93c]/30 bg-[#e5a93c]/10 text-[#e5a93c]">
                  <step.icon className="size-5" />
                </span>
                <span className="font-mono-ui text-3xl font-bold text-white/15">0{i + 1}</span>
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">{step.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{step.desc}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/** Plans straight from the plans table, drawn by the same component as the pricing page. */
export function PlansTeaser({ isAr }: { isAr: boolean }) {
  const { t } = useLanguage()
  const { data } = useSWR<any[]>("/api/plans", fetcher, { revalidateOnFocus: false })
  const plans = normalizeApiPlans(data)
  if (plans.length === 0) return null
  const featured = plans.find((p) => p.catalog_plan_id === TRIAL_PLAN_ID) || plans[Math.floor(plans.length / 2)]
  return (
    <section id="plans" className="mx-auto max-w-7xl px-5 py-20 md:px-10">
      <Reveal>
        <div className="mb-12 text-center">
          <span className="mb-3 block font-mono-ui text-xs font-semibold uppercase tracking-[0.2em] text-[#e5a93c]">{isAr ? "الأسعار" : "Pricing"}</span>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">{isAr ? "خطة لكل مرحلة" : "A plan for every stage"}</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-400">{isAr ? "جرّب أي خطة مجانًا، بدون بطاقة." : "Try any plan free. No card needed."}</p>
        </div>
      </Reveal>
      <Reveal>
        <PlansGrid plans={plans} featuredId={featured?.id} isAr={isAr} t={t} mode="public" />
      </Reveal>
      <Reveal>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-[#e5a93c] transition-all hover:gap-3">
            {isAr ? "قارن كل التفاصيل" : "Compare every detail"} <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

export function FinalCta({ isAr, onStart }: { isAr: boolean; onStart: () => void }) {
  return (
    <section className="mx-auto max-w-5xl px-5 py-20 md:px-10">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-[#e5a93c]/30 bg-gradient-to-br from-[#1a1407] via-[#0c0b0a] to-[#0a0a10] p-10 text-center md:p-16">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#e5a93c]/25 blur-[100px]" />
          <div className="relative">
            <Bot className="mx-auto mb-5 size-9 text-[#e5a93c]" />
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">{isAr ? "جاهز لتشغيل حسابك على الطيار الآلي؟" : "Ready to put your inbox on autopilot?"}</h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-300">
              {isAr ? `${TRIAL_DAYS} أيام مجانًا بمميزات Pro كاملة، بدون بطاقة.` : `${TRIAL_DAYS} days free with the full Pro features. No card needed.`}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={onStart} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#e5a93c] px-8 py-4 font-mono-ui text-sm font-bold text-black shadow-[0_10px_40px_-10px_rgba(229,169,60,0.6)] transition-all hover:-translate-y-0.5 hover:bg-[#d4952b]">
                {isAr ? "ابدأ التجربة المجانية" : "Start free trial"} <ArrowRight className="size-4 rtl:-scale-x-100" />
              </button>
              <span className="inline-flex items-center gap-2 text-sm text-neutral-400">
                <CheckCircle2 className="size-4 text-emerald-400" />
                {isAr ? "ألغِ في أي وقت" : "Cancel anytime"}
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
