export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireAdmin } from "@/lib/auth"
import { maskSmtpSettings, mergeSmtpUpdate } from "@/lib/smtp-settings"

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req)
    if (adminCheck.response) return adminCheck.response

    const supabase = await getSupabaseBypassClient()
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "smtp_settings")
      .maybeSingle()

    if (error) throw new Error(error.message)

    return NextResponse.json(maskSmtpSettings(data?.value))
  } catch (error: any) {
    console.error("[api/admin/settings/smtp] GET error:", error?.message)
    return NextResponse.json({ error: "Failed to load SMTP settings" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req)
    if (adminCheck.response) return adminCheck.response

    const body = await req.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()
    const current = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "smtp_settings")
      .maybeSingle()
    if (current.error) throw new Error(current.error.message)
    const value = mergeSmtpUpdate(current.data?.value, body)

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { 
          key: "smtp_settings", 
          value,
          updated_at: new Date().toISOString()
        },
        { onConflict: "key" }
      )

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[api/admin/settings/smtp] PATCH error:", error?.message)
    return NextResponse.json({ error: "Failed to save SMTP settings" }, { status: 500 })
  }
}
