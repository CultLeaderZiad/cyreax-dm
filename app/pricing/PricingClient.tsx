"use client"

import { PlanCards, PlatformIcons, makeTranslateFeature } from "@/components/pricing/PlansGrid"
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
import { TRIAL_DAYS, TRIAL_PLAN_ID } from "@/lib/billing/plans"

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

  // Every sellable plan the admin has set up, in the order they created them.
  const sellable = plans.filter(p => !p.is_contact_sales)
  const enterprisePlan = plans.find(p => p.is_contact_sales)
  // The featured card is the tier a running trial uses (Pro); otherwise the middle plan.
  const featured = sellable.find(p => p.catalog_plan_id === TRIAL_PLAN_ID) || sellable[Math.floor(sellable.length / 2)]
  const mainPlan = featured
  const money = (n: unknown) => new Intl.NumberFormat("en-US").format(Math.round(Number(n)))

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

  const translateFeature = makeTranslateFeature(t, isAr)
  const renderPlatformIcons = (plan: any) => <PlatformIcons plan={plan} />

  return (
    <div className="space-y-12 relative w-full">
      {/* Title & Subtitle with reactive localization */}
      <div className="text-center space-y-4 mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          {t.pricingTitle || "Simple, transparent pricing"}
        </h1>
        <p className="text-neutral-400 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
          {t.pricingSubtitle || "Start for free, then choose a plan that fits your needs. Pay by card, or by e-wallet / InstaPay in Egypt."}
        </p>
      </div>

      <div className="relative z-[1]">
        {/* Billing Cycle Toggle */}
        {sellable.some(p => p.price_yearly) && (
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

        {/* Trial banner: the length comes from the same constant the server enforces. */}
        <div className="max-w-2xl mx-auto mb-10 text-center rounded-2xl border border-[#e5a93c]/30 bg-[#e5a93c]/[0.06] px-5 py-4">
          <p className="text-sm text-neutral-200">
            <span className="font-semibold text-[#e5a93c]">
              {isAr ? `${TRIAL_DAYS} أيام تجربة مجانية` : `${TRIAL_DAYS}-day free trial`}
            </span>
            {" · "}
            {isAr ? "بدون بطاقة، وبمميزات Pro كاملة." : "No card needed, with the full Pro features."}
          </p>
          <Link
            href="/login"
            className="inline-block mt-3 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-5 rounded-xl transition-colors font-mono-ui text-xs uppercase tracking-wider"
          >
            {t.startFreeTrial || "Start Free Trial"}
          </Link>
        </div>

        {sellable.length === 0 && !enterprisePlan ? (
          <p role="status" className="text-center text-neutral-400 py-16">
            {isAr ? "الخطط غير متاحة مؤقتاً. حاول بعد قليل." : "Plans are temporarily unavailable. Please try again shortly."}
          </p>
        ) : (
          <div
            className={`grid grid-cols-1 gap-8 pt-4 items-stretch ${
              sellable.length + (enterprisePlan ? 1 : 0) >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"
            }`}
          >
            <PlanCards plans={sellable} featuredId={featured?.id} isAnnual={isAnnual} isAr={isAr} t={t} />

            {/* Enterprise / contact sales: only when the admin created such a plan. */}
            {enterprisePlan && (
              <div className="relative pt-4 flex flex-col h-full">
                <div className="p-8 flex flex-col h-full bg-[#0d0e13] border border-white/[0.12] hover:border-white/[0.25] hover:-translate-y-1 rounded-2xl relative shadow-xl transition-all duration-300">
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-5 h-5 text-white" />
                      <h3 className="text-xl font-bold text-white">{enterprisePlan.name}</h3>
                    </div>
                    {enterprisePlan.description && <p className="text-neutral-400 text-sm">{enterprisePlan.description}</p>}
                    <div className="mt-4 text-3xl font-bold text-white font-mono-ui">{t.customPricing || "Custom pricing"}</div>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {(enterprisePlan.features || []).map((f: string) => (
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
            )}
          </div>
        )}

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
