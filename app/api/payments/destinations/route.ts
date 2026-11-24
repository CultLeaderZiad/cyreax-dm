export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { paymentDestinations } from "@/lib/billing/payment-methods"

/**
 * Public payout numbers (they are shown on checkout anyway). Server env is the
 * only source; a method that is not configured is null ("temporarily unavailable").
 */
export async function GET() {
  const d = paymentDestinations()
  const pick = (x: (typeof d)["wallet"]) => (x ? { local: x.local, international: x.international } : null)
  return NextResponse.json(
    { wallet: pick(d.wallet), instapay: pick(d.instapay) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  )
}
