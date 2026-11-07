export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { paymentDestinations } from "@/lib/billing/payment-methods"

/** Public payout numbers (they are shown on checkout anyway). Server env is the source. */
export async function GET() {
  const d = paymentDestinations()
  return NextResponse.json(
    {
      wallet: { local: d.wallet.local, international: d.wallet.international },
      instapay: { local: d.instapay.local, international: d.instapay.international },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  )
}
