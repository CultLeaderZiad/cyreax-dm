import {
  billingFromMembership,
  getWhopMembership,
  getWhopPayment,
  planForVariant,
  type PlanRow,
  type WhopMembership,
} from "@/lib/billing/whop"

/**
 * Applies one verified Whop webhook event to billing_accounts.
 *
 * The event is only a trigger. Whop delivers at least once and out of order,
 * so we read the membership's current state from Whop's API and write that.
 * We trust nothing a buyer could influence:
 * - the plan comes from OUR mapping of the membership's variant_id;
 * - the account comes from the whop_checkouts row our server created, matched
 *   by the random ref in the metadata. Metadata naming another account, a ref
 *   we never issued, or a different plan than that checkout is ignored.
 */

export type SyncResult =
  | { result: "applied"; accountId: string; status: string }
  | { result: "ignored"; reason: string }

type Api = {
  membership: (id: string) => Promise<WhopMembership>
  payment: (id: string) => Promise<any>
}

export function whopApi(apiKey: string, fetchImpl: typeof fetch = fetch): Api {
  return {
    membership: (id) => getWhopMembership(id, apiKey, fetchImpl),
    payment: (id) => getWhopPayment(id, apiKey, fetchImpl),
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null)

/** Membership id an event is about (membership.*, payment.*, refund.*). */
async function membershipIdFor(event: { type: string; data: any }, api: Api): Promise<{ membershipId: string | null; payment: any | null }> {
  const d = event.data || {}
  if (event.type.startsWith("membership.")) return { membershipId: str(d.id), payment: null }
  if (event.type.startsWith("payment.")) {
    return { membershipId: str(d.membership_id) || str(d.membership?.id), payment: d }
  }
  if (event.type.startsWith("refund.")) {
    // The refund payload is a legacy schema; read the payment it refers to.
    const paymentId = str(d.payment?.id) || str(d.payment_id)
    if (!paymentId) return { membershipId: null, payment: null }
    const payment = await api.payment(paymentId)
    return { membershipId: str(payment?.membership_id), payment }
  }
  return { membershipId: null, payment: null }
}

export async function applyWhopEvent(
  supabase: any,
  event: { type: string; data: any },
  api: Api,
  now = new Date(),
): Promise<SyncResult> {
  const handled = /^(membership|payment|refund)\./.test(event.type)
  if (!handled) return { result: "ignored", reason: `event ${event.type} not used` }

  const { membershipId, payment } = await membershipIdFor(event, api)
  if (!membershipId) return { result: "ignored", reason: "no membership on this event" }

  const membership = await api.membership(membershipId)
  const metadata = (membership.metadata || {}) as Record<string, unknown>
  const ref = str(metadata.cyreax_ref)
  if (!ref) return { result: "ignored", reason: "membership was not created by our checkout" }

  const { data: checkout } = await supabase.from("whop_checkouts").select("*").eq("ref", ref).maybeSingle()
  if (!checkout) return { result: "ignored", reason: "unknown checkout ref" }
  if (str(metadata.cyreax_account_id) && metadata.cyreax_account_id !== checkout.account_id) {
    return { result: "ignored", reason: "metadata account does not match the checkout" }
  }
  if (checkout.membership_id && checkout.membership_id !== membership.id) {
    return { result: "ignored", reason: "checkout already belongs to another membership" }
  }

  const { data: plans } = await supabase.from("plans").select("id, catalog_plan_id, billing_cycle, whop_variant_id, whop_variant_id_yearly")
  const match = planForVariant((plans || []) as PlanRow[], membership.variant_id)
  if (!match) return { result: "ignored", reason: "variant is not mapped to a plan" }
  if (match.plan.id !== checkout.plan_id) return { result: "ignored", reason: "variant does not match the plan that was checked out" }

  const accountId = String(checkout.account_id)
  const billing = billingFromMembership(membership, match.interval)

  // A full refund ends access now, whatever the membership says.
  const refunded = event.type.startsWith("refund.") && (payment?.substatus === "refunded" || payment?.status === "refunded")
  if (refunded) {
    billing.status = "canceled"
    billing.currentPeriodEnd = now.toISOString()
  }

  const { data: current } = await supabase
    .from("billing_accounts")
    .select("account_id, status, payment_provider, provider_subscription_id, current_period_end")
    .eq("account_id", accountId)
    .maybeSingle()
  const grants = billing.status === "active" || billing.status === "trialing"
  // An old Whop membership ending must not take away a different, current
  // subscription (for example a newer manual payment).
  if (!grants && current && current.provider_subscription_id && current.provider_subscription_id !== membership.id) {
    return { result: "ignored", reason: "membership is not the account's current subscription" }
  }

  if (!checkout.membership_id) {
    await supabase.from("whop_checkouts").update({ membership_id: membership.id }).eq("ref", ref)
  }

  const row = {
    account_id: accountId,
    plan_id: match.plan.catalog_plan_id || "creator",
    display_plan_id: match.plan.id,
    status: billing.status,
    interval: billing.interval,
    provider: "whop",
    payment_provider: "whop",
    provider_subscription_id: membership.id,
    current_period_end: billing.currentPeriodEnd,
    cancel_at_period_end: billing.cancelAtPeriodEnd,
    trial_ends_at: null,
    scheduled_plan_id: null,
    grace_until: null,
    dunning_step: 0,
    updated_at: now.toISOString(),
  }
  const { error } = await supabase.from("billing_accounts").upsert(row, { onConflict: "account_id" })
  if (error) throw new Error(`billing update failed: ${error.message}`)

  // Legacy markers read by admin stats (same as manual approvals).
  if (grants) {
    const legacy = billing.interval === "lifetime" ? "one_time" : "monthly"
    await supabase.from("accounts").update({ plan: legacy, trial_ends_at: null }).eq("id", accountId)
  }
  return { result: "applied", accountId, status: billing.status }
}
