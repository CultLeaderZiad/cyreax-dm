export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

const STATUSES = ["submitted", "approved", "link_sent", "connected"] as const

/** Admin updates where a customer is in the manual connection process, or marks the request as seen. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ accountId: string }> }) {
  const admin = await requireAdmin(request)
  if (admin.response) return admin.response
  const { accountId } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return NextResponse.json({ error: "Unknown account" }, { status: 400 })
  const body = await request.json().catch(() => null)

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 })
    patch.status = body.status
    if (body.status === "approved") patch.approved_at = new Date().toISOString()
  }
  if (body?.note !== undefined) patch.admin_note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null
  if (body?.seen === true) patch.admin_seen_at = new Date().toISOString()

  const supabase = await getSupabaseBypassClient()
  const { data, error } = await supabase.from("account_onboarding").update(patch).eq("account_id", accountId).select("account_id, status")
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: "No onboarding request for this account" }, { status: 404 })
  return NextResponse.json({ ok: true, status: data[0].status })
}
