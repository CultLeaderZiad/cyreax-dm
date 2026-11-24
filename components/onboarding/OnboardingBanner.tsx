"use client"

import useSWR from "swr"
import { Clock, MailCheck } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

/**
 * After approval: connect channels while the admin finishes the manual link,
 * then the invitation to accept. Disappears once connected.
 */
export function OnboardingBanner({ status }: { status: string | null }) {
  const active = status === "approved" || status === "link_sent"
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
      <span>
        Your details are approved. Connect your channels now; we will send you the invitation to accept on Instagram and Facebook.
        {data?.message ? <span className="ms-1 text-[var(--t1)]">{data.message}</span> : null}
      </span>
    </div>
  )
}
