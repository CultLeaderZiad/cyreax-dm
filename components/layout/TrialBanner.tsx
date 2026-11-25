"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X, Clock, AlertTriangle } from "lucide-react"
import { TRIAL_GRACE_MS, trialPhase } from "@/lib/billing/plans"

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
}

/**
 * Running trial: days left (dismissible). Trial over: a live countdown of the
 * grace window that cannot be dismissed, because access stops when it ends.
 */
export function TrialBanner({ plan, trialEndsAt, graceEndsAt }: { plan: string; trialEndsAt: string | null; graceEndsAt?: string | null }) {
  const [dismissed, setDismissed] = useState(true)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    try {
      setDismissed(sessionStorage.getItem("trial_banner_dismissed") === "true")
    } catch {
      setDismissed(false)
    }
    return () => window.clearInterval(timer)
  }, [])

  if (plan !== "trial" || !trialEndsAt || now === null) return null
  const end = new Date(trialEndsAt).getTime()
  if (!Number.isFinite(end)) return null
  // The grace window is whatever the admin set; the API sends where it ends.
  const graceEnd = graceEndsAt ? new Date(graceEndsAt).getTime() : NaN
  const graceMs = Number.isFinite(graceEnd) ? Math.max(0, graceEnd - end) : TRIAL_GRACE_MS
  const phase = trialPhase(end, now, graceMs)
  if (phase === "over") return null

  if (phase === "grace") {
    return (
      <div role="alert" className="relative z-20 flex min-h-10 select-none items-center justify-center gap-3 border-b border-[var(--gold)]/40 bg-[var(--gold)]/15 px-4 py-2 text-[12.5px] text-[var(--t1)]">
        <AlertTriangle className="size-4 shrink-0 text-[var(--gold)]" />
        <span>
          Your free trial has ended. Subscribe within <strong className="font-mono tabular-nums">{countdown(end + graceMs - now)}</strong> to keep your automations running.
        </span>
        <Link href="/dashboard/billing" className="rounded-md bg-[var(--gold)] px-3 py-1 text-[12px] font-semibold text-black transition-colors hover:bg-[var(--gold2)]">
          Choose a plan
        </Link>
      </div>
    )
  }

  if (dismissed) return null
  const days = Math.max(1, Math.ceil((end - now) / 86_400_000))
  return (
    <div className="relative z-20 flex h-9 select-none items-center justify-between border-b border-[var(--line)] bg-[var(--s2)] px-4 text-[12px] text-[var(--t2)]">
      <div className="mx-auto flex items-center gap-2">
        <Clock className="size-3.5 shrink-0 text-[var(--t3)]" />
        <span>
          Your trial has <strong className="font-mono text-[var(--t1)]">{days} {days === 1 ? "day" : "days"}</strong> remaining.
        </span>
        <Link
          href="/dashboard/billing"
          className="ms-2 rounded-[4px] border border-[var(--line2)] bg-[var(--s3)] px-2.5 py-0.5 text-[11.5px] font-medium text-[var(--t1)] transition-colors hover:bg-[var(--s4)]"
        >
          Choose a plan
        </Link>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true)
          try { sessionStorage.setItem("trial_banner_dismissed", "true") } catch {}
        }}
        aria-label="Dismiss trial banner"
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[var(--t3)] transition-colors hover:bg-[var(--s3)] hover:text-[var(--t1)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
