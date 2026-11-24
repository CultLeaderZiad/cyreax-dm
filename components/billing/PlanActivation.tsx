"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type Phase = "confirming" | "active" | "timeout"

const POLL_MS = 3_000
const GIVE_UP_MS = 120_000

/**
 * Where a customer lands after paying by card. The payment is confirmed on the
 * server by the payment provider's signed event, which can take a few seconds,
 * so this screen asks the server (never the URL) whether the plan is active,
 * and when it is, shows exactly what the plan includes before opening the
 * dashboard.
 */
export function PlanActivation() {
  const [phase, setPhase] = useState<Phase>("confirming")
  const [planName, setPlanName] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const startedAt = useRef(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    startedAt.current = Date.now()
    setPhase("confirming")

    async function poll() {
      while (!cancelled) {
        try {
          const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json())
          if (me?.has_valid_payment && me?.plan && me.plan !== "trial") {
            const plans: any[] = await fetch("/api/plans", { cache: "no-store" }).then((r) => r.json()).catch(() => [])
            const mine = Array.isArray(plans) ? plans.find((p) => p.catalog_plan_id === me.plan) : null
            if (cancelled) return
            setPlanName(mine?.name || null)
            setLines([...new Set([...(mine?.feature_lines || []), ...(mine?.features || [])])] as string[])
            setPhase("active")
            return
          }
        } catch {
          // keep trying until the time is up
        }
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
          if (!cancelled) setPhase("timeout")
          return
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--t1)]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-8 text-center motion-fade-in-up">
        {phase === "confirming" && (
          <>
            <Loader2 className="mx-auto size-9 animate-spin text-[var(--gold)]" />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Confirming your payment</h1>
              <p className="text-[13.5px] text-[var(--t2)]">This usually takes a few seconds. Please keep this page open.</p>
            </div>
          </>
        )}

        {phase === "active" && (
          <>
            <CheckCircle2 className="mx-auto size-10 text-emerald-400" />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{planName ? `Welcome to ${planName}` : "Your plan is active"}</h1>
              <p className="text-[13.5px] text-[var(--t2)]">Here is what you now have:</p>
            </div>
            {lines.length > 0 && (
              <ul className="space-y-2 text-start text-[13.5px]">
                {lines.map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button className="w-full" onClick={() => window.location.replace("/dashboard")}>
              Open my dashboard
            </Button>
          </>
        )}

        {phase === "timeout" && (
          <>
            <RefreshCw className="mx-auto size-8 text-[var(--t3)]" />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Still waiting for confirmation</h1>
              <p className="text-[13.5px] text-[var(--t2)]">
                If you were charged, your plan activates as soon as the confirmation arrives. You can check again, or contact support and we will sort it out.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Check again
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/support">Contact support</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
