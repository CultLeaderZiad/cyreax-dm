"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, Clock, Loader2, Smartphone, Wallet } from "lucide-react"
import CopyButton from "@/components/ui/CopyButton"
import { useLanguage } from "@/lib/i18n/LanguageContext"

export interface CheckoutData {
  planName: string
  interval: "month" | "year" | "lifetime"
  amountEgp: number | null
  referenceCode: string | null
  quote: string | null
  walletNumber: string
  walletInternational: string
  instapayNumber: string
  instapayInternational: string
  supportEmail: string
  supportWhatsapp: string | null
}

type Method = "wallet" | "instapay"

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/png,image/jpeg,image/webp"

const COPY = {
  en: {
    title: "Complete your payment",
    plan: "Plan",
    per: { month: "per month", year: "per year", lifetime: "one-time" },
    total: "Amount to transfer",
    reference: "Your payment reference",
    referenceHint: "Write this in the transfer note if your wallet or bank app allows it.",
    chooseMethod: "How will you pay?",
    wallet: "Any e-wallet",
    walletSub: "Vodafone Cash, Etisalat Cash, Orange Cash, WE Pay, bank wallets",
    instapay: "InstaPay",
    instapaySub: "From any Egyptian bank app",
    sendTo: "Send to",
    steps: {
      wallet: [
        "Open your e-wallet app or dial its USSD code.",
        "Choose “Send money / Transfer to wallet”.",
        "Enter the number above and the exact amount.",
        "Add the payment reference in the note if possible, then confirm.",
        "Take a screenshot of the success screen or keep the SMS.",
      ],
      instapay: [
        "Open the InstaPay app.",
        "Choose “Send money” to a mobile number.",
        "Enter the number above and the exact amount.",
        "Add the payment reference in the note, then confirm.",
        "Take a screenshot of the confirmation screen.",
      ],
    },
    proofTitle: "Send us the proof",
    senderWallet: "Wallet number you sent from",
    senderInstapay: "Your InstaPay mobile number or address",
    senderPlaceholderWallet: "01XXXXXXXXX",
    senderPlaceholderInstapay: "01XXXXXXXXX or name@instapay",
    amountPaid: "Amount you sent (EGP)",
    transactionRef: "Transaction number",
    transactionRefHint: "From the SMS or the app receipt.",
    transferredAt: "When did you transfer?",
    screenshot: "Screenshot of the transfer",
    screenshotHint: "PNG, JPG or WebP, up to 5 MB.",
    terms: ["I agree to the ", "Terms", ", the ", "Refund Policy", " and the ", "Privacy Policy", "."],
    review: "Your plan is activated after we check the transfer, usually within 24 hours. Nothing is charged automatically.",
    submit: "Submit for review",
    errors: {
      file: "Choose a PNG, JPG or WebP image up to 5 MB.",
      terms: "Please accept the terms first.",
      network: "Network error. Please try again.",
    },
    doneTitle: "Under review",
    doneBody: "We received your payment proof. You'll see the result on your Billing page and get a notification when it's reviewed.",
    doneRef: "Keep this reference for support",
    support: "Questions? Contact support",
    ticket: "Open a support ticket",
    billing: "Go to Billing",
    noPriceTitle: "This plan can't be paid online yet",
    noPriceBody: "The EGP price for this plan isn't set. Contact support and we'll help you subscribe.",
    language: "عربي",
  },
  ar: {
    title: "أكمل الدفع",
    plan: "الخطة",
    per: { month: "شهرياً", year: "سنوياً", lifetime: "دفعة واحدة" },
    total: "المبلغ المطلوب تحويله",
    reference: "الرقم المرجعي للدفع",
    referenceHint: "اكتبه في ملاحظة التحويل إذا سمح تطبيق المحفظة أو البنك بذلك.",
    chooseMethod: "طريقة الدفع",
    wallet: "أي محفظة إلكترونية",
    walletSub: "فودافون كاش، اتصالات كاش، أورنج كاش، WE Pay، محافظ البنوك",
    instapay: "إنستاباي",
    instapaySub: "من أي تطبيق بنك مصري",
    sendTo: "حوّل إلى",
    steps: {
      wallet: [
        "افتح تطبيق المحفظة أو اطلب كود الخدمة.",
        "اختر «تحويل أموال / تحويل لمحفظة».",
        "أدخل الرقم الظاهر أعلاه والمبلغ بالضبط.",
        "أضف الرقم المرجعي في الملاحظة إن أمكن، ثم أكّد.",
        "خذ لقطة شاشة لرسالة النجاح أو احتفظ بالرسالة النصية.",
      ],
      instapay: [
        "افتح تطبيق إنستاباي.",
        "اختر «إرسال أموال» إلى رقم موبايل.",
        "أدخل الرقم الظاهر أعلاه والمبلغ بالضبط.",
        "أضف الرقم المرجعي في الملاحظة، ثم أكّد.",
        "خذ لقطة شاشة لشاشة التأكيد.",
      ],
    },
    proofTitle: "أرسل لنا إثبات التحويل",
    senderWallet: "رقم المحفظة التي حوّلت منها",
    senderInstapay: "رقم موبايل أو عنوان إنستاباي الخاص بك",
    senderPlaceholderWallet: "01XXXXXXXXX",
    senderPlaceholderInstapay: "01XXXXXXXXX أو name@instapay",
    amountPaid: "المبلغ الذي حوّلته (جنيه)",
    transactionRef: "رقم العملية",
    transactionRefHint: "من الرسالة النصية أو إيصال التطبيق.",
    transferredAt: "وقت التحويل",
    screenshot: "لقطة شاشة للتحويل",
    screenshotHint: "PNG أو JPG أو WebP بحد أقصى 5 ميجابايت.",
    terms: ["أوافق على ", "الشروط", " و", "سياسة الاسترداد", " و", "سياسة الخصوصية", "."],
    review: "يتم تفعيل خطتك بعد مراجعة التحويل، غالباً خلال 24 ساعة. لا يوجد أي خصم تلقائي.",
    submit: "إرسال للمراجعة",
    errors: {
      file: "اختر صورة PNG أو JPG أو WebP بحد أقصى 5 ميجابايت.",
      terms: "يرجى الموافقة على الشروط أولاً.",
      network: "خطأ في الاتصال. حاول مرة أخرى.",
    },
    doneTitle: "قيد المراجعة",
    doneBody: "استلمنا إثبات الدفع. ستظهر النتيجة في صفحة الفوترة وسيصلك إشعار عند المراجعة.",
    doneRef: "احتفظ بهذا الرقم المرجعي للتواصل مع الدعم",
    support: "لديك سؤال؟ تواصل مع الدعم",
    ticket: "افتح تذكرة دعم",
    billing: "الذهاب إلى الفوترة",
    noPriceTitle: "لا يمكن دفع هذه الخطة إلكترونياً بعد",
    noPriceBody: "لم يتم تحديد سعر الخطة بالجنيه. تواصل مع الدعم وسنساعدك في الاشتراك.",
    language: "English",
  },
} as const

function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const field =
  "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-neutral-500 outline-none focus:border-[#e5a93c]/50"

export default function CheckoutClient({ data }: { data: CheckoutData }) {
  const { language, setLanguage } = useLanguage()
  const t = COPY[language === "ar" ? "ar" : "en"]
  const dir = language === "ar" ? "rtl" : "ltr"
  const amountText = useMemo(
    () => (data.amountEgp ? new Intl.NumberFormat("en-US").format(data.amountEgp) : ""),
    [data.amountEgp],
  )

  const [method, setMethod] = useState<Method>("wallet")
  const [senderRef, setSenderRef] = useState("")
  const [amountPaid, setAmountPaid] = useState(data.amountEgp ? String(data.amountEgp) : "")
  const [transactionRef, setTransactionRef] = useState("")
  const [transferredAt, setTransferredAt] = useState(() => localDateTime(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const supportHref = (ref: string | null) =>
    `mailto:${data.supportEmail}?subject=${encodeURIComponent(`Payment ${ref || ""}`.trim())}`

  const SupportLinks = ({ reference }: { reference: string | null }) => (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span className="text-neutral-400">{t.support}:</span>
      <Link href={`/dashboard/support${reference ? `?ref=${reference}` : ""}`} className="text-[#e5a93c] hover:underline">
        {t.ticket}
      </Link>
      <a href={supportHref(reference)} className="text-[#e5a93c] hover:underline" dir="ltr">
        {data.supportEmail}
      </a>
      {data.supportWhatsapp && (
        <a
          href={`https://wa.me/${data.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Payment ${reference || ""}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#e5a93c] hover:underline"
        >
          WhatsApp
        </a>
      )}
    </div>
  )

  const languageToggle = (
    <button
      type="button"
      onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
      className="text-xs font-mono text-neutral-400 hover:text-white border border-white/10 rounded-lg px-3 py-1.5"
    >
      {t.language}
    </button>
  )

  if (!data.amountEgp || !data.quote) {
    return (
      <div dir={dir} className="space-y-6">
        <div className="flex justify-end">{languageToggle}</div>
        <div className="p-8 border border-white/10 bg-white/[0.03] rounded-2xl text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-[#e5a93c] mx-auto" />
          <h1 className="text-xl font-bold">{t.noPriceTitle}</h1>
          <p className="text-sm text-neutral-400">{t.noPriceBody}</p>
          <SupportLinks reference={null} />
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div dir={dir} className="p-8 border border-[#e5a93c]/30 bg-[#e5a93c]/[0.06] rounded-2xl text-center space-y-5">
        <Clock className="w-8 h-8 text-[#e5a93c] mx-auto" />
        <h1 className="text-2xl font-bold">{t.doneTitle}</h1>
        <p className="text-neutral-300 text-sm leading-relaxed">{t.doneBody}</p>
        <div className="bg-black/40 p-4 rounded-xl border border-white/10 space-y-2 text-start">
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-mono">{t.doneRef}</p>
          <div className="flex items-center justify-between gap-3" dir="ltr">
            <code className="font-mono text-[#e5a93c] text-lg">{done}</code>
            <CopyButton value={done} label="payment reference" />
          </div>
        </div>
        <SupportLinks reference={done} />
        <Link href="/billing" className="inline-block bg-[#e5a93c] hover:bg-[#d4952b] text-black font-bold py-2.5 px-6 rounded-xl text-sm">
          {t.billing}
        </Link>
      </div>
    )
  }

  const destination = method === "wallet"
    ? { local: data.walletNumber, intl: data.walletInternational }
    : { local: data.instapayNumber, intl: data.instapayInternational }

  const onFile = (next: File | null) => {
    setError(null)
    if (next && (next.size > MAX_BYTES || !ACCEPT.split(",").includes(next.type))) {
      setFile(null)
      setError({ message: t.errors.file, field: "proof" })
      return
    }
    setFile(next)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!termsAccepted) return setError({ message: t.errors.terms })
    if (!file) return setError({ message: t.errors.file, field: "proof" })
    setLoading(true)
    try {
      const form = new FormData()
      form.set("quote", data.quote!)
      form.set("method", method)
      form.set("senderRef", senderRef)
      form.set("amountPaid", amountPaid)
      form.set("transactionRef", transactionRef)
      form.set("transferredAt", new Date(transferredAt).toISOString())
      form.set("proof", file)
      const res = await fetch("/api/payments/manual", { method: "POST", body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError({ message: json.error || t.errors.network, field: json.field })
        return
      }
      setDone(json.referenceCode || data.referenceCode)
    } catch {
      setError({ message: t.errors.network })
    } finally {
      setLoading(false)
    }
  }

  const fieldError = (name: string) =>
    error?.field === name ? <p className="text-xs text-red-400 mt-1.5" role="alert">{error.message}</p> : null

  return (
    <form dir={dir} onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t.title}</h1>
        {languageToggle}
      </div>

      <section className="border border-white/10 rounded-2xl p-6 bg-white/[0.04] space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-neutral-400 text-sm">{t.plan}</span>
          <span className="font-semibold">{data.planName} <span className="text-neutral-500 text-sm">· {t.per[data.interval]}</span></span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-4">
          <span className="text-neutral-400 text-sm">{t.total}</span>
          <span className="text-2xl font-bold text-[#e5a93c]" dir="ltr">EGP {amountText}</span>
        </div>
        <div className="border-t border-white/10 pt-4 space-y-1.5">
          <span className="text-neutral-400 text-sm">{t.reference}</span>
          <div className="flex items-center justify-between gap-3 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5" dir="ltr">
            <code className="font-mono text-lg tracking-wider">{data.referenceCode}</code>
            <CopyButton value={data.referenceCode!} label="payment reference" />
          </div>
          <p className="text-xs text-neutral-500">{t.referenceHint}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t.chooseMethod}</h2>
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup">
          {(["wallet", "instapay"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`text-start p-4 rounded-xl border transition-colors ${
                method === m ? "border-[#e5a93c] bg-[#e5a93c]/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"
              }`}
            >
              <span className="flex items-center gap-2 font-bold">
                {m === "wallet" ? <Wallet className="w-4 h-4 text-[#e5a93c]" /> : <Smartphone className="w-4 h-4 text-[#e5a93c]" />}
                {m === "wallet" ? t.wallet : t.instapay}
              </span>
              <span className="block text-xs text-neutral-400 mt-1">{m === "wallet" ? t.walletSub : t.instapaySub}</span>
            </button>
          ))}
        </div>

        <div className="p-5 rounded-xl border border-[#e5a93c]/30 bg-black/30 space-y-4">
          <div>
            <p className="text-xs text-neutral-400 mb-1.5">{t.sendTo}</p>
            <div className="flex items-center justify-between gap-3" dir="ltr">
              <div>
                <p className="font-mono text-2xl font-bold tracking-wider text-[#e5a93c]">{destination.local}</p>
                <p className="font-mono text-xs text-neutral-500">{destination.intl}</p>
              </div>
              <CopyButton value={destination.local} label={method === "wallet" ? "wallet number" : "InstaPay number"} />
            </div>
          </div>
          <ol className="space-y-2 text-sm text-neutral-300 list-decimal ps-5">
            {t.steps[method].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="p-6 border border-white/10 rounded-2xl bg-white/[0.02] space-y-4">
        <h2 className="text-lg font-bold">{t.proofTitle}</h2>

        <div>
          <label htmlFor="pay-sender" className="block text-sm text-neutral-300 mb-2">
            {method === "wallet" ? t.senderWallet : t.senderInstapay}
          </label>
          <input id="pay-sender" dir="ltr" inputMode={method === "wallet" ? "tel" : "text"} className={field}
            placeholder={method === "wallet" ? t.senderPlaceholderWallet : t.senderPlaceholderInstapay}
            value={senderRef} onChange={(e) => setSenderRef(e.target.value)} required />
          {fieldError("senderRef")}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pay-amount" className="block text-sm text-neutral-300 mb-2">{t.amountPaid}</label>
            <input id="pay-amount" dir="ltr" inputMode="decimal" className={field} value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)} required />
            {fieldError("amountPaid")}
          </div>
          <div>
            <label htmlFor="pay-time" className="block text-sm text-neutral-300 mb-2">{t.transferredAt}</label>
            <input id="pay-time" dir="ltr" type="datetime-local" className={field} value={transferredAt}
              max={localDateTime(new Date(Date.now() + 5 * 60_000))} onChange={(e) => setTransferredAt(e.target.value)} required />
            {fieldError("transferredAt")}
          </div>
        </div>

        <div>
          <label htmlFor="pay-ref" className="block text-sm text-neutral-300 mb-2">{t.transactionRef}</label>
          <input id="pay-ref" dir="ltr" className={field} value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)} required />
          <p className="text-xs text-neutral-500 mt-1.5">{t.transactionRefHint}</p>
          {fieldError("transactionRef")}
        </div>

        <div>
          <label htmlFor="pay-proof" className="block text-sm text-neutral-300 mb-2">{t.screenshot}</label>
          <input id="pay-proof" type="file" accept={ACCEPT}
            onChange={(e) => onFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-neutral-300 file:me-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white hover:file:bg-white/15" />
          <p className="text-xs text-neutral-500 mt-1.5">{t.screenshotHint}</p>
          {fieldError("proof")}
        </div>
      </section>

      <label className="flex items-start gap-3 p-4 border border-white/10 rounded-xl bg-white/[0.02] cursor-pointer">
        <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#e5a93c]" />
        <span className="text-xs text-neutral-300 leading-relaxed">
          {t.terms[0]}<Link href="/terms" target="_blank" className="text-[#e5a93c] hover:underline">{t.terms[1]}</Link>
          {t.terms[2]}<Link href="/refund" target="_blank" className="text-[#e5a93c] hover:underline">{t.terms[3]}</Link>
          {t.terms[4]}<Link href="/privacy" target="_blank" className="text-[#e5a93c] hover:underline">{t.terms[5]}</Link>{t.terms[6]}
        </span>
      </label>

      <p className="text-xs text-neutral-500 leading-relaxed flex gap-2">
        <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        {t.review}
      </p>

      {error && !error.field && <p className="text-sm text-red-400" role="alert">{error.message}</p>}

      <button type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#e5a93c] hover:bg-[#d4952b] text-black font-bold py-4 rounded-xl disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t.submit}<ArrowRight className="w-5 h-5 rtl:rotate-180" /></>}
      </button>

      <SupportLinks reference={data.referenceCode} />
    </form>
  )
}
