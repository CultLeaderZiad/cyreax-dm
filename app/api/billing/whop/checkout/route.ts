export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { createCardCheckout } from "@/lib/billing/whop-checkout"

/**
 * POST /api/billing/whop/checkout  { planId, cycle? }
 *
 * Creates a card checkout for one of our plans and returns its URL. The
 * account comes from the session, never from the body.
 */
export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const denied = forbidBelow(session.user.workspace_role, "owner")
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const supabase = await getSupabaseBypassClient()
  const result = await createCardCheckout(supabase, {
    accountId: String(session.user.id),
    planId: String(body?.planId || ""),
    cycle: body?.cycle === "yearly" ? "yearly" : undefined,
    origin: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ url: result.url })
}
