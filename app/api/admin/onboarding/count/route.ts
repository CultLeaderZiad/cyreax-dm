export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

/** The number on the sidebar badge: customers waiting for access approval plus details waiting for review. */
export async function GET() {
  const admin = await requireAdmin()
  if (admin.response) return admin.response
  const supabase = await getSupabaseBypassClient()
  // What needs the admin now: paid customers waiting for access, and details waiting for review.
  const [access, review] = await Promise.all([
    supabase.from("account_onboarding").select("account_id", { count: "exact", head: true }).eq("status", "awaiting_access"),
    supabase.from("account_onboarding").select("account_id", { count: "exact", head: true }).eq("status", "submitted"),
  ])
  return NextResponse.json({ count: (access.count ?? 0) + (review.count ?? 0) })
}
