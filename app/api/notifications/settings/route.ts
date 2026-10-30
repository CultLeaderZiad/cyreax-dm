export const dynamic = 'force-dynamic'

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if (auth.response) return auth.response
    const { user: account } = auth

    const supabase = await getSupabaseBypassClient()
    const { data, error } = await supabase
      .from("accounts")
      .select("notification_settings")
      .eq("id", account.id)
      .maybeSingle()

    if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error

    const settings = data?.notification_settings || {
      email_alerts: true,
      handoff_alerts: true,
      lead_alerts: true,
      low_balance_alerts: true,
      weekly_digest: false,
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error("[notifications/settings] GET error:", error?.message)
    return NextResponse.json({ error: "Failed to load notification settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if (auth.response) return auth.response
    const { user: account } = auth

    const body = await request.json().catch(() => ({}))
    const supabase = await getSupabaseBypassClient()

    const { error } = await supabase
      .from("accounts")
      .update({
        notification_settings: body.settings || body,
      })
      .eq("id", account.id)

    if (error) throw error

    return NextResponse.json({ success: true, settings: body.settings || body })
  } catch (error: any) {
    console.error("[notifications/settings] PUT error:", error?.message)
    return NextResponse.json({ error: "Failed to save notification settings" }, { status: 500 })
  }
}
