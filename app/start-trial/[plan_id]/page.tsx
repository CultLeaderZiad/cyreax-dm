"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { FrontBackground } from "@/components/layout/FrontBackground"

/**
 * Starts the free trial of the plan the visitor picked. Needs an account:
 * without one the visitor is sent to sign up and brought back here. The server
 * decides whether the trial is allowed (one per account) and for how long.
 */
export default function StartTrialPage() {
  const { plan_id: planId } = useParams<{ plan_id: string }>()
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function start() {
      const res = await fetch("/api/billing/trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) })
      if (cancelled) return
      if (res.status === 401) {
        router.replace(`/signup?plan_id=${encodeURIComponent(planId)}&trial=1`)
        return
      }
      if (res.ok) {
        window.location.replace("/dashboard")
        return
      }
      const data = await res.json().catch(() => ({}))
      setMessage(data.error || "Could not start the trial.")
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [planId, router])

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6 text-white">
      <FrontBackground />
      <div className="relative z-10 w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#0d0e13] p-8 text-center">
        {message ? (
          <>
            <h1 className="text-xl font-semibold">We could not start the trial</h1>
            <p className="text-sm text-neutral-300">{message}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href={`/checkout/${planId}`} className="rounded-xl bg-[#e5a93c] px-5 py-3 text-sm font-bold text-black hover:bg-[#d4952b]">Subscribe now</Link>
              <Link href="/dashboard" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-bold hover:bg-white/20">Go to dashboard</Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-[#e5a93c]" />
            <p className="text-sm text-neutral-300">Starting your free trial...</p>
          </>
        )}
      </div>
    </div>
  )
}
