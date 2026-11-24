import { randomUUID } from "crypto"
import { createWhopCheckout, variantForPlan, whopConfig } from "@/lib/billing/whop"
import { captureException } from "@/lib/monitoring"

export type CardCheckoutResult = { ok: true; url: string } | { ok: false; status: number; error: string }

/**
 * Creates the hosted card checkout for one of our plans and returns its URL.
 * The account is the signed-in one, never taken from the request. A random ref
 * ties the checkout to that account and plan (whop_checkouts); the payment
 * webhook only acts on metadata whose ref matches that row.
 *
 * Used by the API route and by the /checkout page, so choosing a plan can send
 * the customer straight to the payment page.
 */
export async function createCardCheckout(
  supabase: any,
  input: { accountId: string; planId: string; cycle?: "yearly"; origin: string },
): Promise<CardCheckoutResult> {
  const config = whopConfig()
  if (!config) return { ok: false, status: 503, error: "Card payments are not available right now." }
  if (!/^[0-9a-f-]{36}$/i.test(input.planId)) return { ok: false, status: 400, error: "Unknown plan" }

  const { data: plan } = await supabase
    .from("plans")
    .select("id, catalog_plan_id, billing_cycle, whop_variant_id, whop_variant_id_yearly, is_active, is_contact_sales")
    .eq("id", input.planId)
    .maybeSingle()
  if (!plan || !plan.is_active || plan.is_contact_sales) return { ok: false, status: 404, error: "Unknown plan" }
  const variant = variantForPlan(plan, input.cycle)
  if (!variant) return { ok: false, status: 409, error: "Card payment is not set up for this plan yet." }

  const ref = randomUUID()
  const { error } = await supabase
    .from("whop_checkouts")
    .insert({ ref, account_id: input.accountId, plan_id: plan.id, interval: variant.interval, whop_variant_id: variant.variantId })
  if (error) {
    console.error("[whop/checkout] could not record checkout:", error?.message)
    return { ok: false, status: 500, error: "Could not start checkout. Please try again." }
  }

  const origin = input.origin.replace(/\/$/, "")
  try {
    const checkout = await createWhopCheckout(
      {
        variantId: variant.variantId,
        redirectUrl: `${origin}/dashboard/billing?checkout=whop`,
        accountId: config.accountId,
        // Copied by the provider onto the payment and membership; matched in the webhook.
        metadata: { cyreax_ref: ref, cyreax_account_id: input.accountId, cyreax_plan_id: String(plan.id) },
      },
      config.apiKey,
    )
    await supabase.from("whop_checkouts").update({ checkout_configuration_id: checkout.id }).eq("ref", ref)
    return { ok: true, url: checkout.purchaseUrl }
  } catch (error) {
    void captureException(error, { route: "billing/whop/checkout" })
    return { ok: false, status: 502, error: "Card checkout is unavailable right now. Please try again shortly." }
  }
}
