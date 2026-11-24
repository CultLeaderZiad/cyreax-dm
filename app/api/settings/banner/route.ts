export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

export async function GET() {
  try {
    const supabase = await getSupabaseBypassClient()
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "update_banner")
      .single()

    if (error || !data) {
      return NextResponse.json({ isActive: false, message: "", link: "", showUpdates: false })
    }

    const bannerVal = { ...(data.value || {}), showUpdates: data.value?.showUpdates === true }
    if (typeof bannerVal.message === "string") {
      bannerVal.message = bannerVal.message.replace(/Helixa/gi, "CYREAX DM")
    }

    return NextResponse.json(bannerVal, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (error) {
    console.error("[api/settings/banner] GET error:", error)
    return NextResponse.json({ isActive: false, message: "", link: "", showUpdates: false })
  }
}

