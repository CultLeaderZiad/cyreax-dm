export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"

/**
 * Retired. It accepted a client-supplied amount with no proof, and its
 * "email invoice" option never sent an invoice. Plan payments now go through
 * /checkout/<plan> and POST /api/payments/manual (signed quote + screenshot).
 */
export async function POST() {
  return NextResponse.json(
    { error: "This payment form was replaced. Choose your plan again on the pricing page to pay by e-wallet or InstaPay." },
    { status: 410 },
  )
}
