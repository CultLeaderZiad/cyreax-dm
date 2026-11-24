"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Plus, Send } from "lucide-react"
import { toast } from "sonner"
import { MACHINES, stateLabel } from "@/lib/state/machines"

interface Ticket {
  id: string
  subject: string
  category: string
  status: string
  payment_reference: string | null
  last_message_at: string
  email?: string | null
}
interface Message {
  id: string
  author_role: "customer" | "admin"
  body: string
  created_at: string
}

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.keys(MACHINES.supportTicket.transitions).map((s) => [s, stateLabel("supportTicket", s)]),
)
const STATUS_LABEL_ADMIN: Record<string, string> = { ...STATUS_LABEL, waiting_customer: "Waiting on customer" }
const STATUS_CLS: Record<string, string> = {
  open: "text-[var(--gold)] border-[#e5a93c]/30",
  waiting_customer: "text-blue-300 border-blue-400/30",
  resolved: "text-green-400 border-green-500/30",
  closed: "text-[var(--t2)] border-white/15",
}
const field = "w-full rounded-lg bg-[var(--s2)] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--t1)] placeholder-neutral-500 outline-none focus:border-[#e5a93c]/50"
const when = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""
}

export function SupportCenter({ admin = false }: { admin?: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const selected = params.get("ticket")
  const labels = admin ? STATUS_LABEL_ADMIN : STATUS_LABEL
  const base = admin ? "/dashboard/admin/support" : "/dashboard/support"

  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Message[] } | null>(null)
  const [creating, setCreating] = useState(!admin && Boolean(params.get("ref")))
  const [form, setForm] = useState({ subject: "", category: params.get("ref") ? "payment" : "bug", body: "", paymentReference: params.get("ref") || "" })
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState(false)

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/support/tickets${admin ? "?all=1" : ""}`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    setTickets(json.tickets || [])
  }, [admin])

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/tickets/${id}`, { cache: "no-store" })
    if (!res.ok) {
      setThread(null)
      return
    }
    setThread(await res.json())
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])
  useEffect(() => {
    if (selected) loadThread(selected)
    else setThread(null)
  }, [selected, loadThread])

  async function createTicket(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const res = await fetch("/api/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return toast.error(json.error || "Could not open the ticket")
      toast.success("Ticket opened. We'll reply here.")
      setCreating(false)
      setForm({ subject: "", category: "bug", body: "", paymentReference: "" })
      await loadList()
      router.push(`${base}?ticket=${json.id}`)
    } finally {
      setBusy(false)
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault()
    if (!thread || !reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/support/tickets/${thread.ticket.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return toast.error(json.error || "Could not send")
      setReply("")
      await Promise.all([loadThread(thread.ticket.id), loadList()])
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(status: string) {
    if (!thread) return
    const res = await fetch(`/api/support/tickets/${thread.ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    if (!res.ok) return toast.error("Could not update the ticket")
    await Promise.all([loadThread(thread.ticket.id), loadList()])
  }

  return (
    <div className={admin ? "space-y-6 text-[var(--t1)]" : "max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6 text-[var(--t1)]"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{admin ? "Support inbox" : "Support"}</h1>
          <p className="text-sm text-[var(--t3)] mt-1">
            {admin ? "Customer tickets. Replies notify the customer in their dashboard." : "Report a bug, a payment problem or anything else. We reply right here."}
          </p>
        </div>
        {!admin && (
          <button onClick={() => { setCreating(true); router.push(base) }} className="inline-flex items-center gap-2 bg-[var(--gold)] hover:bg-[var(--gold2)] text-black font-semibold text-sm px-4 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> New ticket
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        <aside className="border border-[var(--line)] rounded-2xl bg-[var(--s2)] overflow-hidden">
          {tickets === null ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--t3)]" /></div>
          ) : tickets.length === 0 ? (
            <p className="p-6 text-sm text-[var(--t3)]">No tickets yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => { setCreating(false); router.push(`${base}?ticket=${t.id}`) }}
                    className={`w-full text-start px-4 py-3 hover:bg-[var(--s3)] ${selected === t.id ? "bg-white/[0.05]" : ""}`}
                  >
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    {admin && t.email && <p className="text-xs text-[var(--t3)] truncate">{t.email}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10.5px] border rounded-full px-2 py-0.5 ${STATUS_CLS[t.status] || ""}`}>{labels[t.status] || t.status}</span>
                      <span className="text-[10.5px] text-[var(--t3)]">{when(t.last_message_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="border border-[var(--line)] rounded-2xl bg-[var(--s2)] p-5 min-h-[420px]">
          {creating && !admin ? (
            <form onSubmit={createTicket} className="space-y-4">
              <h2 className="text-lg font-semibold">New ticket</h2>
              <div className="grid sm:grid-cols-[1fr_180px] gap-3">
                <input className={field} placeholder="Subject" maxLength={160} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="bug">Bug / something broken</option>
                  <option value="payment">Payment</option>
                  <option value="account">Account</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {form.category === "payment" && (
                <input className={field} dir="ltr" placeholder="Payment reference (CX-XXXXXX), optional" value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} />
              )}
              <textarea className={`${field} min-h-40`} placeholder="What happened? What did you expect? Steps to reproduce help a lot." maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              <button disabled={busy} className="inline-flex items-center gap-2 bg-[var(--gold)] hover:bg-[var(--gold2)] text-black font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
              </button>
            </form>
          ) : thread ? (
            <div className="flex flex-col h-full gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div>
                  <h2 className="font-semibold">{thread.ticket.subject}</h2>
                  <p className="text-xs text-[var(--t3)] mt-0.5">
                    {thread.ticket.category}
                    {thread.ticket.payment_reference ? ` · ${thread.ticket.payment_reference}` : ""}
                    {admin && thread.ticket.email ? ` · ${thread.ticket.email}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] border rounded-full px-2 py-0.5 ${STATUS_CLS[thread.ticket.status] || ""}`}>{labels[thread.ticket.status]}</span>
                  {admin ? (
                    <select className="bg-[var(--s2)] border border-[var(--line)] rounded-lg text-xs px-2 py-1" value={thread.ticket.status} onChange={(e) => setStatus(e.target.value)}>
                      {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL_ADMIN[s]}</option>)}
                    </select>
                  ) : thread.ticket.status !== "closed" ? (
                    <button onClick={() => setStatus("closed")} className="text-xs text-[var(--t2)] hover:text-white border border-[var(--line)] rounded-lg px-2 py-1">Close ticket</button>
                  ) : null}
                </div>
              </div>
              <ul className="space-y-3 flex-1">
                {thread.messages.map((m) => {
                  const mine = admin ? m.author_role === "admin" : m.author_role === "customer"
                  return (
                    <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${mine ? "bg-[#e5a93c]/15 border border-[#e5a93c]/25" : "bg-white/[0.05] border border-[var(--line)]"}`}>
                        <p className="text-[10.5px] text-[var(--t3)] mb-1">{m.author_role === "admin" ? "Support" : admin ? "Customer" : "You"} · {when(m.created_at)}</p>
                        {m.body}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {(admin || thread.ticket.status !== "closed") && (
                <form onSubmit={sendReply} className="flex gap-2 items-end border-t border-[var(--line)] pt-3">
                  <textarea className={`${field} min-h-[44px]`} rows={2} placeholder="Write a reply…" maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />
                  <button disabled={busy || !reply.trim()} aria-label="Send reply" className="h-[44px] px-4 rounded-lg bg-[var(--gold)] text-black disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--t3)]">{admin ? "Pick a ticket." : "Pick a ticket or open a new one."}</p>
          )}
        </section>
      </div>
    </div>
  )
}
