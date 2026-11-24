export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

/** The number on the sidebar badge: unseen submissions plus recent signups that have not filled the form. */
export async function GET() {
  const admin = await requireAdmin()
  if (admin.response) return admin.response
  const supabase = await getSupabaseBypassClient()
  const [unseen, recent, done] = await Promise.all([
    supabase.from("account_onboarding").select("account_id", { count: "exact", head: true }).is("admin_seen_at", null),
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("role", "customer").gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
    supabase.from("account_onboarding").select("account_id", { count: "exact", head: true }).gte("submitted_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
  ])
  const awaiting = Math.max(0, (recent.count ?? 0) - (done.count ?? 0))
  return NextResponse.json({ count: (unseen.count ?? 0) + awaiting })
}
