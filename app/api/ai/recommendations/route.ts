export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { getRecommendations, InsightsDisabledError } from "@/lib/ai/recommendations/service"

export async function GET(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  try {
    const supabase = await getSupabaseBypassClient()
    return NextResponse.json(await getRecommendations(supabase, String(session.user.id)))
  } catch (e: any) {
    if (e instanceof InsightsDisabledError) return NextResponse.json({ error: e.message, code: "FEATURE_NOT_IN_PLAN" }, { status: 403 })
    console.error("[ai/recommendations]", e?.message || e)
    return NextResponse.json({ error: "Could not load recommendations." }, { status: 500 })
  }
}
