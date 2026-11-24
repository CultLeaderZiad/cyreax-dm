"use client"

import ReflectiveCard from "@/components/reactbits/ReflectiveCard"
import { PlanCardBody } from "@/components/billing/PlanCardBody"
import { ChannelBadge } from "@/components/ui/ChannelBadge"

/**
 * The plan cards, drawn exactly once. The pricing page, the landing page, the
 * dashboard Billing page and the choose-a-plan screen all render this, so they
 * can never drift apart.
 */

export function makeTranslateFeature(t: any, isAr: boolean) {
  return (feature: string) => {
    if (!isAr) return feature
    const lower = feature.toLowerCase()
    if (lower.includes("unlimited automations") || lower.includes("high-volume automations")) return (t as any).enterpriseAutomations || "أتمتة مخصصة وعالية السعة"
    if (lower.includes("priority support")) return t.prioritySupport || "دعم ذو أولوية"
    if (lower.includes("multiple platforms")) return t.multiplePlatforms || "منصات متعددة"
    if (lower.includes("ai features")) return t.aiFeatures || "ميزات الذكاء الاصطناعي"
    if (lower.includes("automated agents")) return t.automatedAgents || "وكلاء أتمتة مستقلون"
    if (lower.includes("custom integrations")) return "تكاملات مخصصة"
    if (lower.includes("dedicated account")) return "مدير حساب مخصص"
    if (lower.includes("sla guarantees")) return "ضمانات مستوى الخدمة SLA"
    if (lower.includes("custom limits")) return "حدود استخدام مخصصة"
    if (lower.includes("early access")) return t.earlyAccess || "وصول مبكر للميزات الجديدة"
    if (lower.includes("connect 5+ channels")) return t.connectChannels || "ربط أكثر من 5 قنوات"
    if (lower.includes("beta version")) return t.betaUpdates || "أولوية الوصول إلى النسخ التجريبية"
    return feature
  }
}

export function PlatformIcons({ plan }: { plan: any }) {
    const p = plan?.platforms || { instagram: true, facebook: true, whatsapp: false, telegram: false, tiktok: false }
    return (
      <div className="flex items-center gap-2 mt-6 pt-6 border-t border-white/10">
        {p.instagram && <ChannelBadge channel="instagram" size="sm" title="Instagram" />}
        {p.facebook && <ChannelBadge channel="facebook" size="sm" title="Facebook" />}
        {p.whatsapp && <ChannelBadge channel="whatsapp" size="sm" title="WhatsApp" />}
        {p.telegram && <ChannelBadge channel="telegram" size="sm" title="Telegram" />}
        {p.tiktok && <ChannelBadge channel="tiktok" size="sm" title="TikTok" />}
      </div>
    )
  }

const money = (n: unknown) => new Intl.NumberFormat("en-US").format(Math.round(Number(n)))

/** The cards only (children of a grid): used by the pricing page, which adds its own extra card. */
export function PlanCards({ plans, featuredId, isAnnual, isAr, t, mode = "public", currentPlanId }: { plans: any[]; featuredId?: string; isAnnual: boolean; isAr: boolean; t: any; mode?: "public" | "dashboard"; currentPlanId?: string | null }) {
  const translateFeature = makeTranslateFeature(t, isAr)
  return (
    <>
            {plans.map((plan) => {
              const isFeatured = plan.id === featuredId
              const usd = isAnnual && plan.price_yearly ? plan.price_yearly : plan.price_usd
              const egp = isAnnual ? plan.price_yearly_egp : plan.price_egp
              const lines: string[] = (plan.features || []).filter((f: string) => !f.toLowerCase().includes("only one platform"))
              const body = (
                <PlanCardBody
                  name={plan.name}
                  description={plan.description}
                  usd={usd}
                  egp={egp ? `EGP ${money(egp)}` : null}
                  period={plan.billing_cycle === "lifetime" ? (isAr ? "مرة واحدة" : "once") : `/${isAnnual ? (isAr ? "سنة" : "yr") : (isAr ? "شهر" : "mo")}`}
                  lines={lines.map(translateFeature)}
                  featured={isFeatured}
                  isAr={isAr}
                  extra={<PlatformIcons plan={plan} />}
                  trialDays={mode === "public" ? Number(plan.effective_limits?.trialDays || 0) : 0}
                  cta={
                    mode === "dashboard" && plan.id === currentPlanId
                      ? { label: isAr ? "خطتك الحالية" : "Current plan", disabled: true }
                      : mode === "public" && Number(plan.effective_limits?.trialDays || 0) > 0
                        ? { label: isAr ? "ابدأ التجربة المجانية" : "Start free trial", href: `/start-trial/${plan.id}` }
                        : { label: `${t.selectPlan || "Select"} ${plan.name}`, href: `/checkout/${plan.id}${isAnnual ? "?cycle=yearly" : ""}` }
                  }
                  secondary={mode === "public" && Number(plan.effective_limits?.trialDays || 0) > 0 ? { label: isAr ? "أو اشترك الآن" : "or subscribe now", href: `/checkout/${plan.id}${isAnnual ? "?cycle=yearly" : ""}` } : undefined}
                />
              )
              return (
                <div key={plan.id} className="relative pt-4 flex flex-col h-full">
                  {isFeatured && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#e5a93c] text-black px-4 py-1.5 rounded-full text-[11px] font-mono-ui font-bold uppercase tracking-widest z-30 whitespace-nowrap shadow-xl">
                      {t.bestValue || "BEST VALUE"}
                    </div>
                  )}
                  {isFeatured ? (
                    // Gold-tinted brushed metal card (React Bits ReflectiveCard). data-keep-dark:
                    // the metal is dark in every theme, so the light-mode remap must not darken its text.
                    <ReflectiveCard
                      tint="#E8B84A"
                      metalness={1}
                      roughness={0.35}
                      blurStrength={6}
                      shine={1.1}
                      glare={0.55}
                      tiltStrength={6}
                      width="100%"
                      height="100%"
                      radius={18}
                      className="flex-1 min-h-[600px]"
                    >
                      <div className="p-4 flex flex-col h-full [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]" data-keep-dark>
                        {body}
                      </div>
                    </ReflectiveCard>
                  ) : (
                    <div className="p-8 flex flex-col h-full bg-[#0d0e13] border border-white/[0.12] hover:border-white/[0.25] hover:-translate-y-1 rounded-2xl relative shadow-xl transition-all duration-300">
                      {body}
                    </div>
                  )}
                </div>
              )
            })}
    </>
  )
}

/** A standalone grid of plan cards (landing page, dashboard). */
export function PlansGrid({ plans, featuredId, isAnnual = false, isAr, t, mode = "public", currentPlanId }: { plans: any[]; featuredId?: string; isAnnual?: boolean; isAr: boolean; t: any; mode?: "public" | "dashboard"; currentPlanId?: string | null }) {
  return (
    <div className={`grid grid-cols-1 gap-8 pt-4 items-stretch ${plans.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
      <PlanCards plans={plans} featuredId={featuredId} isAnnual={isAnnual} isAr={isAr} t={t} mode={mode} currentPlanId={currentPlanId} />
    </div>
  )
}

/**
 * Plans as /api/plans returns them, shaped like the pricing page's: the
 * generated feature lines (from the real limits), the admin's own lines and the
 * agents included, without duplicates.
 */
export function normalizeApiPlans(apiPlans: any): any[] {
  if (!Array.isArray(apiPlans)) return []
  return apiPlans
    .filter((p) => !p.is_contact_sales)
    .map((p) => {
      const agents = (p.active_agents || []).map((a: any) => a?.name).filter(Boolean)
      return { ...p, features: [...new Set([...(p.feature_lines || []), ...(p.features || []), ...agents])] }
    })
}
