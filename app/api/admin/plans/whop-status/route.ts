export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { getWhopPlan, isWhopVariantId, whopConfig } from "@/lib/billing/whop"

/**
 * Live view for Admin -> Plans: for every plan with a Whop plan id, what Whop
 * itself reports right now (title, price). Edits made on Whop show up here
 * with no change on our side, because checkout always reads the plan from Whop.
 */
export async function GET() {
  const admin = await requireAdmin()
  if (admin.response) return admin.response
  const config = whopConfig()
  const supabase = await getSupabaseBypassClient()
  const { data: plans, error } = await supabase.from("plans").select("id, whop_variant_id, whop_variant_id_yearly")
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const out: Record<string, { whop: Awaited<ReturnType<typeof getWhopPlan>> | null; error: string | null }> = {}
  await Promise.all(
    (plans || []).flatMap((plan: any) =>
      [plan.whop_variant_id, plan.whop_variant_id_yearly]
        .filter((id: unknown): id is string => isWhopVariantId(id))
        .map(async (id: string) => {
          if (!config) { out[id] = { whop: null, error: "The card checkout key is not set on the server" }; return }
          try { out[id] = { whop: await getWhopPlan(id, config.apiKey), error: null } }
          catch (e: any) { out[id] = { whop: null, error: String(e?.message || e).replace(/Whop/g, "Card checkout").slice(0, 160) } }
        }),
    ),
  )
  return NextResponse.json({ configured: Boolean(config), plans: out })
}
