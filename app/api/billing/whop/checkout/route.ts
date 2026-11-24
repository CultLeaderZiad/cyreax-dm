export const dynamic = "force-dynamic"

import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { createWhopCheckout, variantForPlan, whopConfig } from "@/lib/billing/whop"
import { captureException } from "@/lib/monitoring"

/**
 * POST /api/billing/whop/checkout  { planId, cycle? }
 *
 * Creates a Whop checkout for one of our plans and returns its URL. The
 * account comes from the session, never from the body. A random ref ties the
 * checkout to this account and plan (whop_checkouts); the webhook only acts on
 * metadata whose ref matches that row.
 */
export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const denied = forbidBelow(session.user.workspace_role, "owner")
  if (denied) return denied
  const account = session.user

  const config = whopConfig()
  if (!config) return NextResponse.json({ error: "Card payments are not available right now." }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const planId = String(body?.planId || "")
  const cycle = body?.cycle === "yearly" ? "yearly" : undefined
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return NextResponse.json({ error: "Unknown plan" }, { status: 400 })

  const supabase = await getSupabaseBypassClient()
  const { data: plan } = await supabase
    .from("plans")
    .select("id, catalog_plan_id, billing_cycle, whop_variant_id, whop_variant_id_yearly, is_active, is_contact_sales")
    .eq("id", planId)
    .maybeSingle()
  if (!plan || !plan.is_active || plan.is_contact_sales) return NextResponse.json({ error: "Unknown plan" }, { status: 404 })
  const variant = variantForPlan(plan, cycle)
  if (!variant) return NextResponse.json({ error: "Card payment is not set up for this plan yet." }, { status: 409 })

  const ref = randomUUID()
  const { error } = await supabase
    .from("whop_checkouts")
    .insert({ ref, account_id: account.id, plan_id: plan.id, interval: variant.interval, whop_variant_id: variant.variantId })
  const row = { ref }
  if (error) {
    console.error("[whop/checkout] could not record checkout:", error?.message)
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 })
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, "")
  try {
    const checkout = await createWhopCheckout(
      {
        variantId: variant.variantId,
        redirectUrl: `${origin}/dashboard/billing?checkout=whop`,
        accountId: config.accountId,
        // Copied by Whop onto the payment and membership; matched in the webhook.
        metadata: {
          cyreax_ref: String(row.ref),
          cyreax_account_id: String(account.id),
          cyreax_plan_id: String(plan.id),
        },
      },
      config.apiKey,
    )
    await supabase.from("whop_checkouts").update({ checkout_configuration_id: checkout.id }).eq("ref", row.ref)
    return NextResponse.json({ url: checkout.purchaseUrl })
  } catch (error) {
    void captureException(error, { route: "billing/whop/checkout" })
    return NextResponse.json({ error: "Card checkout is unavailable right now. Please try again shortly." }, { status: 502 })
  }
}
