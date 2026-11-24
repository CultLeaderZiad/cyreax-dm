export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { syncWhopPrices } from "@/lib/billing/whop-price-sync"
import { whopConfig } from "@/lib/billing/whop"

/** Admin -> Plans "Sync prices from Whop": reads every plan from Whop now. */
export async function POST() {
  const admin = await requireAdmin()
  if (admin.response) return admin.response
  if (!whopConfig()) return NextResponse.json({ error: "WHOP_API_KEY is not set." }, { status: 503 })
  const supabase = await getSupabaseBypassClient()
  return NextResponse.json(await syncWhopPrices(supabase, { force: true }))
}
