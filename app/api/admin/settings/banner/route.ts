export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireAdmin } from "@/lib/auth"

export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req)
    if (adminCheck.response) return adminCheck.response

    const body = await req.json()
    const { isActive, message, link, type = "standard", content = "" } = body

    if (typeof isActive !== "boolean" || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()
    // Older callers (the Banner tab on the Users page) do not send showUpdates: keep what is stored.
    const existing = await supabase.from("app_settings").select("value").eq("key", "update_banner").maybeSingle()
    const showUpdates = typeof body.showUpdates === "boolean" ? body.showUpdates : Boolean(existing.data?.value?.showUpdates)
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { 
          key: "update_banner", 
          value: { isActive, message: message.slice(0, 300), link: typeof link === "string" ? link.slice(0, 300) : "", type, content: typeof content === "string" ? content.slice(0, 20000) : "", showUpdates },
          updated_at: new Date().toISOString()
        },
        { onConflict: "key" }
      )

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[api/admin/settings/banner] PATCH error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

