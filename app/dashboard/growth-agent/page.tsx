"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Lock, Send, Sparkles, X } from "lucide-react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface Proposal { id: string; summary: string; status: "pending" | "confirmed" | "dismissed" | "failed"; result?: string | null }
interface Turn { role: "user" | "assistant"; content: string; proposals?: Proposal[] }

export default function GrowthAgentPage() {
  const { language } = useLanguage()
  const ar = language === "ar"
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [lock, setLock] = useState<null | { message: string; quota: boolean }>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }, [turns, busy])

  const starters = ar
    ? ["ما أهم شيء أعمله اليوم؟", "أي أتمتة لا تعمل؟", "كيف حال التعليقات السلبية؟"]
    : ["What should I do first today?", "Which automations are not firing?", "How are my comments doing?"]

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    const history = turns.map((t) => ({ role: t.role, content: t.content }))
    setTurns((t) => [...t, { role: "user", content: message }])
    setInput("")
    setBusy(true)
    try {
      const res = await fetch("/api/ai/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history }) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403 && data.code === "FEATURE_NOT_IN_PLAN") { setLock({ message: data.error, quota: false }); return }
      if (res.status === 402) { setLock({ message: data.error, quota: true }); return }
      setTurns((t) => [...t, { role: "assistant", content: res.ok ? data.reply : data.error || (ar ? "تعذر الرد الآن." : "Could not answer right now."), proposals: data.proposals }])
    } finally {
      setBusy(false)
    }
  }

  async function decide(turnIndex: number, id: string, decision: "confirm" | "dismiss") {
    const res = await fetch(`/api/ai/agent/proposals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) })
    const data = await res.json().catch(() => ({}))
    setTurns((all) => all.map((t, i) => i !== turnIndex ? t : { ...t, proposals: t.proposals?.map((p) => p.id === id ? { ...p, status: res.ok ? data.status : "failed", result: res.ok ? data.result : data.error } : p) }))
  }

  if (lock) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-6 text-center space-y-3 motion-fade-in-up">
          <Lock className="size-6 mx-auto text-[var(--t3)]" />
          <p className="text-[14px] text-[var(--t1)]">{lock.message}</p>
          <Link href="/dashboard/billing" className="inline-flex h-9 items-center rounded-lg bg-[var(--gold)] px-4 text-[13px] font-semibold text-black hover:bg-[var(--gold2)] transition-colors">
            {ar ? "الخطط" : "See plans"}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-5 text-[var(--gold)]" />
        <h1 className="text-[18px] font-semibold text-[var(--t1)]">{ar ? "مساعد النمو" : "Growth Agent"}</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pe-1" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-3 motion-fade-in-up">
            <p className="text-[13px] text-[var(--t2)]">{ar ? "اسألني عن حسابك. أجيب من بياناتك الفعلية فقط، وأي تغيير أقترحه لا يتم إلا بعد موافقتك." : "Ask about your account. I answer only from your real data, and any change I suggest happens only after you confirm."}</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--line)] bg-[var(--s1)] px-3 py-1.5 text-[12.5px] text-[var(--t1)] transition-all hover:-translate-y-0.5 hover:border-[var(--gold)]/50 cursor-pointer">{s}</button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"} motion-fade-in-up`}>
            <div className="max-w-[85%] space-y-2">
              <div className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap ${t.role === "user" ? "bg-[var(--gold)] text-black" : "border border-[var(--line)] bg-[var(--s1)] text-[var(--t1)]"}`} dir="auto">
                {t.content}
              </div>
              {t.proposals?.map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--gold)]/30 bg-[var(--s1)] p-3 space-y-2">
                  <p className="text-[12.5px] text-[var(--t1)]" dir="auto">{p.summary}</p>
                  {p.status === "pending" ? (
                    <div className="flex gap-2">
                      <button onClick={() => decide(i, p.id, "confirm")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--gold)] px-3 text-[12.5px] font-semibold text-black transition-colors hover:bg-[var(--gold2)] cursor-pointer"><Check className="size-3.5" />{ar ? "تأكيد" : "Confirm"}</button>
                      <button onClick={() => decide(i, p.id, "dismiss")} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-[12.5px] text-[var(--t2)] transition-colors hover:text-[var(--t1)] cursor-pointer"><X className="size-3.5" />{ar ? "تجاهل" : "Dismiss"}</button>
                    </div>
                  ) : (
                    <p className={`text-[12px] ${p.status === "confirmed" ? "text-[var(--green)]" : p.status === "failed" ? "text-[var(--red)]" : "text-[var(--t3)]"}`}>
                      {p.status === "confirmed" ? p.result || (ar ? "تم" : "Done") : p.status === "dismissed" ? (ar ? "تم التجاهل" : "Dismissed") : p.result || (ar ? "فشل التنفيذ" : "Failed")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[12.5px] text-[var(--t3)]"><Loader2 className="size-3.5 animate-spin" />{ar ? "أحلل بياناتك..." : "Looking at your data..."}</div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} dir="auto" placeholder={ar ? "اسأل مساعد النمو..." : "Ask the Growth Agent..."} className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--s1)] px-4 text-[13.5px] text-[var(--t1)] outline-none transition-colors focus:border-[var(--gold)]" />
        <button type="submit" disabled={busy || !input.trim()} aria-label={ar ? "إرسال" : "Send"} className="grid size-11 place-items-center rounded-xl bg-[var(--gold)] text-black transition-all hover:bg-[var(--gold2)] disabled:opacity-40 cursor-pointer"><Send className="size-4 rtl:-scale-x-100" /></button>
      </form>
    </div>
  )
}
