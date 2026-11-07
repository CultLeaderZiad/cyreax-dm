"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Smartphone, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"
import { MyPayments } from "@/components/billing/MyPayments"

export interface PaymentMethodCardProps {
  amount?: string
  currency?: "EGP" | "SAR" | "USD"
  currentPlanId?: string
  pendingReference?: string
}

type Method = "wallet" | "instapay"
interface Destinations {
  wallet: { local: string; international: string }
  instapay: { local: string; international: string }
}

const STEPS: Record<Method, string[]> = {
  wallet: [
    "Open any e-wallet (Vodafone Cash, Etisalat Cash, Orange Cash, WE Pay, bank wallets).",
    "Send the exact plan amount to the number above.",
    "Choose your plan, then upload the transfer screenshot with the transaction number.",
  ],
  instapay: [
    "Open InstaPay and send money to the mobile number above.",
    "Send the exact plan amount.",
    "Choose your plan, then upload the transfer screenshot with the transaction number.",
  ],
}

/**
 * Where to send money, with the full numbers and working copy buttons.
 * Proof upload and review happen on the real checkout (/checkout/<plan>),
 * which signs the exact EGP amount and a reference code for the order.
 * No status is shown here that the server has not confirmed.
 */
export function PaymentMethodCard(_props: PaymentMethodCardProps) {
  const [method, setMethod] = useState<Method>("wallet")
  const [dest, setDest] = useState<Destinations | null>(null)

  useEffect(() => {
    fetch("/api/payments/destinations")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDest)
      .catch(() => setDest(null))
  }, [])

  const current = dest?.[method]

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
      <h3 className="text-[14px] font-semibold text-[var(--t1)]">Payment method</h3>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Payment method">
        {(["wallet", "instapay"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn(
              "rounded-lg border p-2.5 text-start transition-colors cursor-pointer flex flex-col justify-between h-[68px]",
              method === m
                ? "border-[var(--goldline)] bg-[var(--goldbg)]"
                : "border-[var(--line)] bg-[var(--s2)] hover:border-[var(--line2)]",
            )}
          >
            <span className="flex items-center gap-2 font-semibold text-[12px] text-[var(--t1)]">
              {m === "wallet" ? <Wallet className="w-4 h-4 text-[var(--gold)]" /> : <Smartphone className="w-4 h-4 text-[var(--gold)]" />}
              {m === "wallet" ? "Any e-wallet" : "InstaPay"}
            </span>
            <span className="text-[10px] text-[var(--t3)] font-mono">
              {m === "wallet" ? "Vodafone · Etisalat · Orange · WE" : "Any Egyptian bank app"}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--s2)] p-4 space-y-3">
        <span className="text-[10.5px] text-[var(--t3)] font-mono block">
          {method === "wallet" ? "Send to e-wallet number" : "Send to InstaPay number"}
        </span>
        <div className="flex items-center justify-between gap-3" dir="ltr">
          <div>
            <p className="font-mono text-[20px] font-bold tracking-wider text-[var(--gold2)] select-all">
              {current?.local || "…"}
            </p>
            <p className="font-mono text-[11px] text-[var(--t3)] select-all">{current?.international || ""}</p>
          </div>
          <CopyButton value={current?.local || ""} label={method === "wallet" ? "wallet number" : "InstaPay number"} />
        </div>
        <ol className="list-decimal ps-5 space-y-1 text-[11.5px] text-[var(--t2)]">
          {STEPS[method].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 h-[34px] px-4 rounded-[6px] bg-[var(--gold)] text-black font-semibold text-[12px] hover:bg-[var(--gold2)] transition-colors"
        >
          Choose plan &amp; upload proof <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </Link>
        <p className="text-[10.5px] text-[var(--t3)]">
          Your plan activates after an admin reviews the transfer, usually within 24 hours.
        </p>
      </div>

      <MyPayments />
    </div>
  )
}
