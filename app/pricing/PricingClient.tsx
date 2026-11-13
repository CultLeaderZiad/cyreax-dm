"use client"

import ReflectiveCard from "@/components/reactbits/ReflectiveCard"
import { useState } from "react"
import { CheckCircle, Zap, Star } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { toast } from "sonner"
import { ChannelBadge } from "@/components/ui/ChannelBadge"

export default function PricingClient({ plans }: { plans: any[] }) {
  const { t, language } = useLanguage()
  const isAr = language === "ar"

  const [isAnnual, setIsAnnual] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    company: "",
    needs_description: ""
  })

  const mainPlan = plans.find(p => !p.is_contact_sales && p.billing_cycle === "monthly") || plans[0]
  const enterprisePlan = plans.find(p => p.is_contact_sales)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/enterprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error("Failed to submit inquiry")
      toast.success(t.inquirySuccess || "Inquiry submitted successfully! We will contact you soon.")
      setDialogOpen(false)
      setForm({ full_name: "", email: "", company: "", needs_description: "" })
    } catch (err: any) {
      toast.error(err.message || "Failed to submit inquiry")
    } finally {
      setIsSubmitting(false)
    }
  }

  const translateFeature = (feature: string) => {
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

  const renderPlatformIcons = (plan: any) => {
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

  return (
    <div className="space-y-12 relative w-full">
      {/* Title & Subtitle with reactive localization */}
      <div className="text-center space-y-4 mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          {t.pricingTitle || "Simple, transparent pricing"}
        </h1>
        <p className="text-neutral-400 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
          {t.pricingSubtitle || "Start for free, then choose a plan that fits your needs. We offer payments via Vodafone Cash or Email payment request."}
        </p>
      </div>

      <div className="relative z-[1]">
        {/* Billing Cycle Toggle */}
        {mainPlan && mainPlan.price_yearly && (
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="bg-white/5 border border-white/10 p-1 rounded-2xl flex items-center shadow-lg">
              <button 
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider font-mono-ui transition-all ${!isAnnual ? 'bg-[#e5a93c] text-black shadow-lg' : 'text-neutral-400 hover:text-white'}`}
              >
                {t.monthly || "Monthly"}
              </button>
              <button 
                onClick={() => setIsAnnual(true)}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider font-mono-ui transition-all ${isAnnual ? 'bg-[#e5a93c] text-black shadow-lg' : 'text-neutral-400 hover:text-white'}`}
              >
                {t.annually || "Annually"}{" "}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${isAnnual ? 'bg-black/20 text-black' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {t.save20 || "Save 20%"}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4 items-stretch">
          {/* Free Trial Plan */}
          <div className="relative pt-4 flex flex-col h-full">
            <div className="p-8 flex flex-col h-full bg-[#0d0e13]/85 border border-white/[0.08] hover:border-white/[0.16] rounded-2xl relative shadow-xl backdrop-blur-md transition-all duration-300">
              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">
                  {t.freeTrialTitle || "Free Trial"}
                </h3>
                <p className="text-neutral-400 text-sm">
                  {t.freeTrialDesc || "To test the waters."}
                </p>
                <div className="mt-4 text-3xl font-bold text-white font-mono-ui">$0</div>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  t.freeTrialFeature1 || "Full access to all features",
                  t.freeTrialFeature2 || "7-day limit",
                  t.freeTrialFeature3 || "No credit card required"
                ].map(f => (
                  <li key={f} className="flex items-start gap-3 text-sm text-neutral-300">
                    <CheckCircle className="w-5 h-5 text-neutral-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="w-full block text-center bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-colors mt-auto font-mono-ui text-xs uppercase tracking-wider"
              >
                {t.startFreeTrial || "Start Free Trial"}
              </Link>
            </div>
          </div>

          {/* Main / Featured Plan */}
          {mainPlan && (
            <div className="relative pt-4 flex flex-col h-full">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#e5a93c] text-black px-4 py-1.5 rounded-full text-[11px] font-mono-ui font-bold uppercase tracking-widest z-30 whitespace-nowrap shadow-xl">
                {t.bestValue || "BEST VALUE"}
              </div>
              {/* Gold-tinted brushed metal card (React Bits ReflectiveCard). data-keep-dark:
                  the metal is dark in every theme, so the light-mode remap must not darken its text. */}
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
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-5 h-5 text-[#e5a93c]" />
                    <h3 className="text-xl font-bold text-[#e5a93c]">
                      {mainPlan.name === "Monthly Plan" || mainPlan.name === "Pro Plan" ? (t.monthlyPlanTitle || mainPlan.name) : mainPlan.name}
                    </h3>
                  </div>
                  <p className="text-white/80 text-sm">
                    {t.monthlyPlanDesc || mainPlan.description}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white font-mono-ui">
                      {(() => {
                        // Customers pay in EGP; show it whenever the admin set an EGP price.
                        const egp = isAnnual ? mainPlan.price_yearly_egp : mainPlan.price_egp
                        if (egp) return `EGP ${new Intl.NumberFormat("en-US").format(Math.round(Number(egp)))}`
                        return `$${isAnnual ? mainPlan.price_yearly : mainPlan.price_usd}`
                      })()}
                    </span>
                    <span className="text-white/75 text-xs">/{isAnnual ? (isAr ? 'سنة' : 'yr') : (isAr ? 'شهر' : 'mo')}</span>
                  </div>
                </div>
                
                <ul className="space-y-4 mb-8 flex-1">
                  {(mainPlan.features || [])
                    .filter((f: string) => !f.toLowerCase().includes("only one platform"))
                    .map((f: string) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-white/90">
                      <CheckCircle className="w-5 h-5 text-[#e5a93c] shrink-0" />
                      <span>{translateFeature(f)}</span>
                    </li>
                  ))}
                </ul>

                {renderPlatformIcons(mainPlan)}

                <Link 
                  href={`/checkout/${mainPlan.id}${isAnnual ? '?cycle=yearly' : '?cycle=monthly'}`} 
                  className="mt-6 w-full block text-center font-bold py-3 rounded-xl transition-all bg-[#e5a93c] hover:bg-[#d4952b] text-black shadow-lg font-mono-ui text-xs uppercase tracking-wider"
                >
                  {t.selectMonthlyPlan || `${t.selectPlan || "Select"} ${mainPlan.name}`}
                </Link>
                </div>
              </ReflectiveCard>
            </div>
          )}

          {/* Enterprise / Lifetime Plan */}
          <div className="relative pt-4 flex flex-col h-full">
            <div className="p-8 flex flex-col h-full bg-[#0d0e13]/85 border border-white/[0.08] hover:border-white/[0.16] rounded-2xl relative shadow-xl backdrop-blur-md transition-all duration-300">
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-white" />
                  <h3 className="text-xl font-bold text-white">
                    {enterprisePlan?.name === "Lifetime Deal" || enterprisePlan?.name === "Enterprise"
                      ? (t.enterprisePlanTitle || enterprisePlan?.name || "Enterprise")
                      : (enterprisePlan?.name || "Enterprise")}
                  </h3>
                </div>
                <p className="text-neutral-400 text-sm">
                  {t.enterprisePlanDesc || enterprisePlan?.description || "For large teams and custom needs."}
                </p>
                <div className="mt-4 text-3xl font-bold text-white font-mono-ui">
                  {t.customPricing || "Custom pricing"}
                </div>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {(enterprisePlan?.features || [
                  "Custom integrations",
                  "Dedicated account manager",
                  "SLA guarantees",
                  "Custom limits"
                ]).map((f: string) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-neutral-300">
                    <CheckCircle className="w-5 h-5 text-neutral-500 shrink-0" />
                    <span>{translateFeature(f)}</span>
                  </li>
                ))}
              </ul>

              {renderPlatformIcons(enterprisePlan)}

              <button 
                onClick={() => setDialogOpen(true)}
                className="mt-6 w-full block text-center bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-colors font-mono-ui text-xs uppercase tracking-wider cursor-pointer"
              >
                {t.contactSales || "Contact Sales"}
              </button>
            </div>
          </div>
        </div>

        {/* Contact Sales Modal */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0B0812] border-white/10 text-white sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t.contactSalesTitle || "Contact Sales"}</DialogTitle>
              <DialogDescription className="text-neutral-400">
                {t.contactSalesDesc || "Tell us about your needs and our team will get back to you with a custom plan."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>{t.fullName || "Full Name"}</Label>
                <Input 
                  required 
                  value={form.full_name}
                  onChange={e => setForm({...form, full_name: e.target.value})}
                  className="bg-white/5 border-white/10" 
                  placeholder={isAr ? "الاسم الكامل" : "Full Name"} 
                />
              </div>
              <div className="space-y-2">
                <Label>{t.email || "Email"}</Label>
                <Input 
                  required 
                  type="email"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className="bg-white/5 border-white/10" 
                  placeholder="john@example.com" 
                />
              </div>
              <div className="space-y-2">
                <Label>{t.companyOpt || "Company (optional)"}</Label>
                <Input 
                  value={form.company}
                  onChange={e => setForm({...form, company: e.target.value})}
                  className="bg-white/5 border-white/10" 
                  placeholder={isAr ? "اسم الشركة" : "Acme Inc."} 
                />
              </div>
              <div className="space-y-2">
                <Label>{t.whatAreNeeds || "What are your needs?"}</Label>
                <Textarea 
                  value={form.needs_description}
                  onChange={e => setForm({...form, needs_description: e.target.value})}
                  className="bg-white/5 border-white/10" 
                  placeholder={t.needsPlaceholder || "Tell us about your volume, custom integrations, etc."} 
                />
              </div>
              <DialogFooter className="mt-6 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10 text-neutral-300 hover:bg-white/5">
                  {t.cancel || "Cancel"}
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-[#e5a93c] hover:bg-[#d4952b] text-black font-semibold font-mono-ui text-xs uppercase tracking-wider cursor-pointer">
                  {isSubmitting ? (t.submitting || "Submitting...") : (t.submitInquiry || "Submit Inquiry")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
