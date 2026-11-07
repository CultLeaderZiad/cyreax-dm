"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Clock, XCircle } from "lucide-react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { brand } from "@/lib/brand"

interface PaymentRow {
  id: string
  createdAt: string
  amountEgp: number | null
  method: string | null
  referenceCode: string | null
  status: "under_review" | "approved" | "rejected"
  reason: string | null
  periodEnd: string | null
}

const COPY = {
  en: {
    title: "Your payments",
    under_review: "Under review",
    approved: "Approved",
    rejected: "Rejected",
    until: "Active until",
    reason: "Reason",
    wallet: "E-wallet",
    instapay: "InstaPay",
    other: "Manual",
    help: "Questions about a payment? Email",
  },
  ar: {
    title: "مدفوعاتك",
    under_review: "قيد المراجعة",
    approved: "تمت الموافقة",
    rejected: "مرفوض",
    until: "سارية حتى",
    reason: "السبب",
    wallet: "محفظة إلكترونية",
    instapay: "إنستاباي",
    other: "يدوي",
    help: "لديك سؤال عن دفعة؟ راسل",
  },
} as const

const STYLE = {
  under_review: { icon: Clock, cls: "text-[#e5a93c] border-[#e5a93c]/30 bg-[#e5a93c]/10" },
  approved: { icon: CheckCircle, cls: "text-green-400 border-green-500/30 bg-green-500/10" },
  rejected: { icon: XCircle, cls: "text-red-400 border-red-500/30 bg-red-500/10" },
} as const

/** Status comes straight from the server; nothing is assumed client-side. */
export function MyPayments() {
  const { language } = useLanguage()
  const t = COPY[language === "ar" ? "ar" : "en"]
  const [payments, setPayments] = useState<PaymentRow[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/payments/manual", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { payments: [] }))
      .then((json) => alive && setPayments(json.payments || []))
      .catch(() => alive && setPayments([]))
    return () => {
      alive = false
    }
  }, [])

  if (!payments || payments.length === 0) return null
  const date = (iso: string) => new Date(iso).toLocaleDateString(language === "ar" ? "ar-EG" : "en-GB")

  return (
    <section dir={language === "ar" ? "rtl" : "ltr"} className="border border-white/[0.08] rounded-2xl p-6 bg-white/[0.02] mb-8 space-y-4">
      <p className="font-mono text-xs text-neutral-500 uppercase tracking-wider">{t.title}</p>
      <ul className="space-y-3">
        {payments.map((p) => {
          const { icon: Icon, cls } = STYLE[p.status]
          return (
            <li key={p.id} className="border border-white/[0.06] rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-2.5 py-1 ${cls}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {t[p.status]}
                </span>
                <span className="text-xs text-neutral-500">{date(p.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-300">
                {p.amountEgp != null && <span dir="ltr">EGP {p.amountEgp}</span>}
                <span>{p.method === "wallet" ? t.wallet : p.method === "instapay" ? t.instapay : t.other}</span>
                {p.referenceCode && <code className="font-mono text-neutral-400" dir="ltr">{p.referenceCode}</code>}
              </div>
              {p.status === "approved" && p.periodEnd && (
                <p className="text-xs text-green-400">{t.until} {date(p.periodEnd)}</p>
              )}
              {p.status === "rejected" && p.reason && (
                <p className="text-xs text-red-300">{t.reason}: {p.reason}</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        {t.help}{" "}
        <a href={`mailto:${brand.supportEmail}`} className="text-[#e5a93c] hover:underline" dir="ltr">{brand.supportEmail}</a>
      </p>
    </section>
  )
}

export default MyPayments
