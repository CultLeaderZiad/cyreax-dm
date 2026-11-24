"use client"

import { useState } from "react"
import { CreditCard, Loader2 } from "lucide-react"

/**
 * "Pay with card". Asks our server for a Whop checkout tied to the
 * signed-in account, then sends the browser to Whop's hosted checkout.
 * Access is granted by the Whop webhook, never by this page.
 */
export default function WhopCardOption({
  planId,
  cycle,
  planName,
  priceText,
  available,
}: {
  planId: string
  cycle?: "yearly"
  planName: string
  /** Real price from the plans table, if set; Whop shows the final amount. */
  priceText: string | null
  available: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/whop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || typeof json.url !== "string") {
        setError(json.error || "Card checkout is unavailable right now.")
        setBusy(false)
        return
      }
      window.location.assign(json.url)
    } catch {
      setError("Network error. Please try again.")
      setBusy(false)
    }
  }

  return (
    <section className="p-6 border border-white/10 rounded-2xl bg-white/[0.02] space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Pay with card</h2>
          <p className="text-sm text-neutral-400 mt-1">
            {planName}
            {priceText ? <> · <span dir="ltr">{priceText}</span></> : null}
          </p>
        </div>
        <CreditCard className="w-6 h-6 text-[#e5a93c] shrink-0" aria-hidden="true" />
      </div>
      {available ? (
        <>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#e5a93c] hover:bg-[#d4952b] text-black font-bold py-3 rounded-xl text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Pay with card
          </button>
          <p className="text-xs text-neutral-500">
            Secure card checkout. Your plan activates as soon as the payment is confirmed.
          </p>
        </>
      ) : (
        <p role="status" className="text-sm text-neutral-400">Card payment is temporarily unavailable for this plan.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  )
}
