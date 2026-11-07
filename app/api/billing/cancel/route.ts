// Cancel at period end. Billing is manual (wallet / InstaPay) with no provider
// subscription to call, so this only flags cancel_at_period_end. Access is
// preserved until current_period_end; only the account owner (or a platform
// admin) may cancel, and we never write 'canceling' anywhere.
//
// POST /api/billing/cancel
export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { resolvePlan } from "@/lib/billing/plans"
import { scheduleCancel } from "@/lib/billing/activation"

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const account = session.user

  // Only the owner of the account (or a platform admin) may cancel the paid
  // period; a team member gets an explicit 403 rather than a silent no-op.
  const role = account.workspace_role ?? account.role
  if (role !== "owner" && account.role !== "admin") {
    return NextResponse.json({ error: "Only the account owner can cancel at period end." }, { status: 403 })
  }

  try {
    const supabase = await getSupabaseBypassClient()

    const { data: billing, error: billingError } = await supabase
      .from("billing_accounts")
      .select("status, plan_id, current_period_end, cancel_at_period_end, provider, provider_subscription_id")
      .eq("account_id", account.id)
      .maybeSingle()
    if (billingError) {
      return NextResponse.json({ error: "Could not load the billing account." }, { status: 500 })
    }

    if (!billing || (billing.status !== "active" && billing.status !== "past_due")) {
      return NextResponse.json({ error: "No active paid plan to cancel." }, { status: 404 })
    }

    const plan = resolvePlan(billing.plan_id)
    if (plan.monthlyUsd <= 0) {
      return NextResponse.json({ error: "Only paid plans can be canceled at period end." }, { status: 400 })
    }

    const subscriptionId = billing.provider_subscription_id

    // Source of truth: keep status='active', only flag the period-end cancel.
    await scheduleCancel({
      accountId: account.id,
      providerRef: subscriptionId ? String(subscriptionId) : null,
      periodEnd: billing.current_period_end ?? null,
      actorId: account.id,
    })

    return NextResponse.json({
      success: true,
      periodEnd: billing.current_period_end,
      message: "Subscription canceled. It stays active until the end of the paid period.",
    })
  } catch (error: any) {
    console.error("[billing/cancel] Error:", error?.message ?? error)
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 })
  }
}
