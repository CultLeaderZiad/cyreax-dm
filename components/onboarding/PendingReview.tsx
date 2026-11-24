"use client"

import { useState } from "react"
import useSWR from "swr"
import { Hourglass, LogOut, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetcher } from "@/lib/fetcher"
import { OnboardingForm } from "@/components/onboarding/OnboardingForm"

/**
 * Shown after the customer sent their account details and until the admin
 * approves them. They can correct their details meanwhile. The server does not
 * rely on this screen: it only reflects the review status.
 */
export function PendingReview({ onLogout, email }: { onLogout: () => void; email?: string | null }) {
  const [editing, setEditing] = useState(false)
  const { data } = useSWR<{ values?: Record<string, string>; message?: string | null }>("/api/onboarding", fetcher, { refreshInterval: 30_000, revalidateOnFocus: true })

  if (editing) return <OnboardingForm initial={data?.values} />

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--t1)]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-8 text-center motion-fade-in-up">
        <Hourglass className="mx-auto size-9 text-[var(--gold)]" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Your details are under review</h1>
          <p className="text-[13.5px] leading-relaxed text-[var(--t2)]">
            Thank you. We are checking your details and will approve your account shortly. As soon as it is approved you can open your dashboard, connect your channels, and we will send you the invitation to accept on Instagram and Facebook.
          </p>
          {data?.message && <p className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-3 text-[13px] text-[var(--t1)]">{data.message}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={() => setEditing(true)} className="gap-2">
            <Pencil className="size-3.5" /> Edit my details
          </Button>
          <Button variant="secondary" onClick={onLogout} className="gap-2">
            <LogOut className="size-3.5" /> Log out{email ? ` (${email})` : ""}
          </Button>
        </div>
        <p className="text-[12px] text-[var(--t3)]">This page updates by itself. You do not need to refresh.</p>
      </div>
    </div>
  )
}
