"use client"

import useSWR from "swr"
import { Clock, MailCheck } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

/**
 * Where the customer is while the admin connects their accounts by hand:
 * waiting for us, or an invitation to accept. Disappears once connected.
 */
export function OnboardingBanner({ status }: { status: string | null }) {
  const active = status === "submitted" || status === "link_sent"
  const { data } = useSWR<{ message?: string | null }>(active ? "/api/onboarding" : null, fetcher, { revalidateOnFocus: true })
  if (!active) return null

  if (status === "link_sent") {
    return (
      <div role="status" className="relative z-20 flex min-h-10 items-center justify-center gap-3 border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[12.5px] text-[var(--t1)]">
        <MailCheck className="size-4 shrink-0 text-emerald-400" />
        <span>
          <strong>Action needed:</strong> we sent you an invitation. Open Instagram and Facebook and accept it so we can finish connecting your accounts.
          {data?.message ? <span className="ms-1 text-[var(--t2)]">{data.message}</span> : null}
        </span>
      </div>
    )
  }
  return (
    <div role="status" className="relative z-20 flex min-h-9 items-center justify-center gap-2 border-b border-[var(--line)] bg-[var(--s2)] px-4 py-1.5 text-[12px] text-[var(--t2)]">
      <Clock className="size-3.5 shrink-0 text-[var(--t3)]" />
      <span>We received your details and are connecting your accounts. We will send you an invitation to accept.</span>
    </div>
  )
}
