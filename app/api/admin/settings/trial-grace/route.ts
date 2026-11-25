export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireAdmin } from "@/lib/auth"
import { GRACE_SETTING_KEY, loadGraceHours } from "@/lib/billing/grace"
import { TRIAL_GRACE_HOURS, TRIAL_GRACE_MAX_HOURS } from "@/lib/billing/plans"

/** The hours a finished trial keeps working before access pauses (0 = pause right away). */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck.response) return adminCheck.response
  const supabase = await getSupabaseBypassClient()
  return NextResponse.json({ hours: await loadGraceHours(supabase), default: TRIAL_GRACE_HOURS, max: TRIAL_GRACE_MAX_HOURS })
}

export async function PUT(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req)
    if (adminCheck.response) return adminCheck.response

    const body = await req.json().catch(() => ({}))
    const hours = (body as any)?.hours
    if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 0 || hours > TRIAL_GRACE_MAX_HOURS) {
      return NextResponse.json({ error: `Hours must be a whole number from 0 to ${TRIAL_GRACE_MAX_HOURS}.` }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: GRACE_SETTING_KEY, value: { hours }, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, hours })
  } catch (error: any) {
    console.error("[api/admin/settings/trial-grace] PUT error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
