"use client"

import { useEffect } from "react"
import { BadgeCheck, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shown to a paying customer until the admin approves access. The next step
 * (the details form) opens by itself: the page checks again every 30 seconds.
 */
export function AwaitingAccess({ onLogout, email }: { onLogout: () => void; email?: string | null }) {
  useEffect(() => {
    const timer = window.setInterval(() => window.location.reload(), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--t1)]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-8 text-center motion-fade-in-up">
        <BadgeCheck className="mx-auto size-10 text-emerald-400" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Payment received</h1>
          <p className="text-[13.5px] leading-relaxed text-[var(--t2)]">
            Thank you. We are approving your account now. As soon as it is approved you will be asked for the details we need to connect your Instagram, Facebook and Telegram accounts.
          </p>
        </div>
        <Button variant="secondary" onClick={onLogout} className="gap-2">
          <LogOut className="size-3.5" /> Log out{email ? ` (${email})` : ""}
        </Button>
        <p className="text-[12px] text-[var(--t3)]">This page updates by itself. You do not need to refresh.</p>
      </div>
    </div>
  )
}
