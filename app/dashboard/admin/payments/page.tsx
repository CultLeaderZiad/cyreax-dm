"use client"

// Admin review of wallet / InstaPay payments. The parent layout
// (app/dashboard/admin/layout.tsx) redirects non-admins on the server, and
// every API call here is checked again with requireAdmin.
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react"
import { toast } from "sonner"

type Status = "pending" | "approved" | "rejected"

interface AdminPayment {
  id: string
  created_at: string
  status: Status
  plan_name: string | null
  plan_slug: string | null
  interval: string | null
  amount: number | null
  amount_egp: number | null
  amount_paid_egp: number | null
  payment_method: string | null
  sender_ref: string | null
  transaction_reference: string
  reference_code: string | null
  transferred_at: string | null
  proof_url: string | null
  admin_note: string | null
  rejection_reason: string | null
  note: string | null
  period_end: string | null
  accounts: { email: string | null; plan: string | null } | null
}

const METHOD_LABEL: Record<string, string> = {
  wallet: "E-wallet",
  instapay: "InstaPay",
  vodafone_cash: "Vodafone Cash (old form)",
  email: "Email request (old form)",
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"
}

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState<Status>("pending")
  const [payments, setPayments] = useState<AdminPayment[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setPayments(null)
    const res = await fetch(`/api/admin/payments?status=${status}`, { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || "Could not load payments")
      setPayments([])
      return
    }
    setPayments(json.payments || [])
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  async function review(payment: AdminPayment, action: "approve" | "reject") {
    const note = (notes[payment.id] || "").trim()
    if (action === "reject" && !note) {
      toast.error("Add a reason before rejecting. The customer sees it.")
      return
    }
    if (action === "approve" && !window.confirm(`Approve ${payment.reference_code || payment.transaction_reference} and activate the plan?`)) return
    setBusy(payment.id)
    try {
      const res = await fetch(`/api/admin/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || "Review failed")
        return
      }
      toast.success(json.alreadyReviewed ? `Already ${json.status}` : action === "approve" ? "Approved and activated" : "Rejected")
      setPayments((rows) => (rows || []).filter((row) => row.id !== payment.id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#03010A] text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard/admin" className="font-mono text-xs text-neutral-500 hover:text-white">← Admin</Link>
            <h1 className="text-3xl font-bold mt-2">Payments</h1>
            <p className="text-sm text-neutral-500 mt-1">E-wallet and InstaPay transfers waiting for review. A plan activates only when you approve.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 text-sm border border-white/10 rounded-lg px-3 py-2 hover:bg-white/5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="flex gap-2" role="tablist">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm capitalize border ${status === s ? "border-[#e5a93c] bg-[#e5a93c]/10 text-white" : "border-white/10 text-neutral-400 hover:text-white"}`}>
              {s}
            </button>
          ))}
        </div>

        {payments === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
        ) : payments.length === 0 ? (
          <p className="text-neutral-500 text-sm py-12 text-center">No {status} payments.</p>
        ) : (
          <ul className="space-y-4">
            {payments.map((p) => {
              const expected = p.amount_egp ?? p.amount
              const paid = p.amount_paid_egp
              const mismatch = expected != null && paid != null && Number(paid) !== Number(expected)
              return (
                <li key={p.id} className="border border-white/10 rounded-2xl bg-white/[0.02] overflow-hidden">
                  <div className="grid md:grid-cols-[260px_1fr]">
                    <div className="bg-black/40 border-b md:border-b-0 md:border-e border-white/10 flex items-center justify-center min-h-48">
                      {p.proof_url ? (
                        <a href={p.proof_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.proof_url} alt={`Transfer proof ${p.reference_code || ""}`} className="w-full h-full max-h-96 object-contain" />
                          <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 text-[11px] bg-black/70 rounded px-2 py-1 opacity-0 group-hover:opacity-100">
                            Open <ExternalLink className="w-3 h-3" />
                          </span>
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-500 p-6 text-center">No screenshot (older form)</span>
                      )}
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{p.accounts?.email || "Unknown account"}</p>
                          <p className="text-xs text-neutral-500">Submitted {when(p.created_at)}</p>
                        </div>
                        {p.reference_code && <code className="font-mono text-[#e5a93c] text-sm border border-[#e5a93c]/30 rounded px-2 py-1">{p.reference_code}</code>}
                      </div>

                      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div><dt className="text-neutral-500 text-xs">Plan</dt><dd>{p.plan_name || p.plan_slug || "—"} {p.interval ? <span className="text-neutral-500">· {p.interval}</span> : null}</dd></div>
                        <div><dt className="text-neutral-500 text-xs">Method</dt><dd>{METHOD_LABEL[p.payment_method || ""] || p.payment_method || "—"}</dd></div>
                        <div><dt className="text-neutral-500 text-xs">Expected</dt><dd className="font-mono">EGP {expected ?? "—"}</dd></div>
                        <div>
                          <dt className="text-neutral-500 text-xs">Customer says they sent</dt>
                          <dd className={`font-mono ${mismatch ? "text-red-400" : ""}`}>
                            {paid != null ? `EGP ${paid}` : "—"}
                            {mismatch && <span className="inline-flex items-center gap-1 ms-2 text-xs"><AlertTriangle className="w-3 h-3" />differs</span>}
                          </dd>
                        </div>
                        <div><dt className="text-neutral-500 text-xs">Sent from</dt><dd className="font-mono" dir="ltr">{p.sender_ref || "—"}</dd></div>
                        <div><dt className="text-neutral-500 text-xs">Transaction number</dt><dd className="font-mono" dir="ltr">{p.transaction_reference}</dd></div>
                        <div><dt className="text-neutral-500 text-xs">Transferred at</dt><dd>{when(p.transferred_at)}</dd></div>
                        {p.note && <div className="sm:col-span-2"><dt className="text-neutral-500 text-xs">Note (older form)</dt><dd className="break-words">{p.note}</dd></div>}
                        {status !== "pending" && (
                          <div className="sm:col-span-2">
                            <dt className="text-neutral-500 text-xs">{status === "approved" ? "Active until" : "Reason"}</dt>
                            <dd>{status === "approved" ? when(p.period_end) : p.admin_note || p.rejection_reason || "—"}</dd>
                          </div>
                        )}
                      </dl>

                      {status === "pending" && (
                        <div className="space-y-3 border-t border-white/10 pt-4">
                          <label className="block">
                            <span className="text-xs text-neutral-500">Note (required to reject, shown to the customer)</span>
                            <textarea rows={2} maxLength={500} value={notes[p.id] || ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2.5 text-sm outline-none focus:border-[#e5a93c]/50" />
                          </label>
                          <div className="flex flex-wrap gap-3">
                            <button disabled={busy === p.id} onClick={() => review(p, "approve")}
                              className="inline-flex items-center gap-2 bg-green-500/90 hover:bg-green-500 text-black font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                              {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Approve
                            </button>
                            <button disabled={busy === p.id} onClick={() => review(p, "reject")}
                              className="inline-flex items-center gap-2 border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                              <XCircle className="w-4 h-4" /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-neutral-600">Screenshot links expire after 2 minutes. Refresh to get new ones.</p>
      </div>
    </div>
  )
}
