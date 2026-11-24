"use client"

// Admin -> Onboarding: every customer who sent their account details (and
// recent signups who have not yet), so the accounts can be connected by hand.
// The admin layout redirects non-admins and every API call re-checks admin.
import { useEffect, useState } from "react"
import useSWR from "swr"
import { Check, Copy, Eye, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type State = "awaiting_form" | "submitted" | "link_sent" | "connected"
interface Item {
  accountId: string
  email: string | null
  accountCreatedAt: string | null
  state: State
  fullName?: string
  company?: string | null
  instagramUsername?: string | null
  facebookId?: string | null
  telegramToken?: string | null
  note?: string | null
  submittedAt?: string
  seen?: boolean
}

const LABEL: Record<State, { text: string; cls: string }> = {
  awaiting_form: { text: "Signed up, form not sent", cls: "bg-neutral-500/20 text-neutral-300" },
  submitted: { text: "Details received", cls: "bg-amber-500/20 text-amber-300" },
  link_sent: { text: "Invitation sent", cls: "bg-blue-500/20 text-blue-300" },
  connected: { text: "Connected", cls: "bg-emerald-500/20 text-emerald-300" },
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="truncate font-mono text-[13px] text-white" dir="ltr">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => { void navigator.clipboard.writeText(value); toast.success("Copied") }}
        className="shrink-0 cursor-pointer text-neutral-400 transition-colors hover:text-white"
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-4" />
      </button>
    </div>
  )
}

function Row({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [note, setNote] = useState(item.note || "")
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  // Opening a request marks it as seen, which clears it from the badge.
  useEffect(() => {
    if (item.state !== "awaiting_form" && !item.seen) {
      void fetch(`/api/admin/onboarding/${item.accountId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: true }) }).then(onChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/onboarding/${item.accountId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || "Failed"); return }
      toast.success(ok)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function reveal() {
    const res = await fetch(`/api/admin/onboarding/${item.accountId}/reveal`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || "Could not show the token"); return }
    setToken(data.token)
  }

  const label = LABEL[item.state]
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0d0e13] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-white">{item.fullName || item.email || "New customer"}{item.company ? <span className="font-normal text-neutral-400"> · {item.company}</span> : null}</p>
          <p className="text-xs text-neutral-500">{item.email}{item.accountCreatedAt ? ` · signed up ${new Date(item.accountCreatedAt).toLocaleString()}` : ""}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${label.cls}`}>{label.text}</span>
      </div>

      {item.state === "awaiting_form" ? (
        <p className="text-[13px] text-neutral-400">This customer created an account but has not sent their details yet. They are asked for them as soon as they open the dashboard.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.instagramUsername && <CopyValue label="Instagram username" value={item.instagramUsername} />}
            {item.facebookId && <CopyValue label="Facebook Page ID" value={item.facebookId} />}
            {item.telegramToken && (
              <div className="space-y-2 sm:col-span-2">
                {token ? <CopyValue label="Telegram bot token" value={token} /> : (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div><p className="text-[10px] uppercase tracking-wider text-neutral-500">Telegram bot token</p><p className="font-mono text-[13px] text-white" dir="ltr">{item.telegramToken}</p></div>
                    <Button type="button" size="sm" variant="secondary" onClick={reveal}><Eye className="me-1.5 size-3.5" /> Show</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-neutral-400" htmlFor={`note-${item.accountId}`}>Message shown to the customer (optional)</label>
            <Textarea id={`note-${item.accountId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="For example: open the invitation on Instagram under notifications and tap Accept." />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || item.state === "connected"} onClick={() => patch({ status: "link_sent", note }, "Customer told to accept the invitation")}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="me-1.5 size-3.5" />} I sent the invitation
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || item.state === "connected"} onClick={() => patch({ status: "connected", note }, "Marked as connected")}>
              <Check className="me-1.5 size-3.5" /> Connected
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ note }, "Message saved")}>Save message</Button>
          </div>
        </>
      )}
    </div>
  )
}

export default function AdminOnboardingPage() {
  const { data, error, isLoading, mutate } = useSWR<{ items: Item[]; attention: number }>("/api/admin/onboarding", fetcher, { refreshInterval: 60_000 })
  const items = data?.items || []
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Onboarding</h1>
        <p className="mt-1 text-xs text-neutral-500">Customers send their account details here. Connect their accounts, send them the invitation, then mark it.</p>
      </div>
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-[#0d0e13]" />
      ) : error ? (
        <p className="text-sm text-red-400">Could not load onboarding requests.</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#0d0e13] p-6 text-sm text-neutral-400">No new signups in the last 14 days and no pending requests.</p>
      ) : (
        <div className="space-y-4">{items.map((item) => <Row key={item.accountId} item={item} onChanged={() => void mutate()} />)}</div>
      )}
    </div>
  )
}
