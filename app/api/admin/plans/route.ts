export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { whopIdsError } from "@/lib/billing/whop"

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin()
  if (adminCheck.response) return adminCheck.response

  const supabase = await getSupabaseBypassClient()
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin()
  if (adminCheck.response) return adminCheck.response

  try {
    const body = await request.json()
    const { name, description, price_usd, price_yearly, price_egp, price_yearly_egp, catalog_plan_id, billing_cycle, features, stripe_price_id, is_active, is_contact_sales, platforms, whop_variant_id, whop_variant_id_yearly } = body
    const whopError = whopIdsError(body)
    if (whopError) return NextResponse.json({ error: whopError }, { status: 400 })
    const supabase = await getSupabaseBypassClient()

    const { data, error } = await supabase
      .from("plans")
      .insert({
        name,
        description,
        price_usd,
        price_yearly,
        price_egp: price_egp ?? null,
        price_yearly_egp: price_yearly_egp ?? null,
        catalog_plan_id: catalog_plan_id || null,
        whop_variant_id: whop_variant_id || null,
        whop_variant_id_yearly: whop_variant_id_yearly || null,
        billing_cycle,
        features: features || [],
        stripe_price_id,
        is_active,
        is_contact_sales,
        platforms
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

