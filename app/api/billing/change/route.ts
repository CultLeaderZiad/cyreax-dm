export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { schedulePlanChange } from "@/lib/billing/lifecycle"
import { syncLegacyPlanMirrors } from "@/lib/billing/activation"
import { resolvePlan } from "@/lib/billing/plans"
import { activePeriodValid } from "@/lib/billing/enforce"

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const body = await request.json().catch(() => ({}))
  const next = resolvePlan(String(body.planId || ""))
  // Only the plans that are sold can be chosen: never the internal Free or Unlimited tiers.
  if (!body.planId || next.id === "expired" || next.hidden) return NextResponse.json({ error: "Unknown plan." }, { status: 400 })
  const supabase = await getSupabaseBypassClient()
  const billing = await supabase.from("billing_accounts").select("plan_id, status, interval, current_period_end").eq("account_id", session.user.id).maybeSingle()
  // A plan change is a service for someone who has PAID. Anyone else (trial,
  // expired, canceled, never paid) goes through checkout, whatever the plan.
  const paid = Boolean(
    billing.data &&
      (billing.data.status === "active" || billing.data.status === "past_due") &&
      activePeriodValid(billing.data as any),
  )
  if (!paid) return NextResponse.json({ checkoutRequired: true, planId: next.id })
  const currentPlan = billing.data?.plan_id || session.user.plan || "creator_free"
  const change = schedulePlanChange({
    currentPlan,
    nextPlan: next.id,
    periodEnd: billing.data?.current_period_end || null,
    nowMs: Date.now(),
  })
  if (change.requiresPayment) {
    return NextResponse.json({ checkoutRequired: true, planId: next.id })
  }
  if (change.immediatePlan) {
    await supabase.from("billing_accounts").upsert({
      account_id: session.user.id,
      plan_id: change.immediatePlan,
      status: change.immediatePlan === "creator_free" ? "active" : billing.data?.status || "active",
      scheduled_plan_id: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" })
    // Keep the legacy plan mirrors in step with the source of truth.
    await syncLegacyPlanMirrors(session.user.id, change.immediatePlan)
    return NextResponse.json({ applied: change.immediatePlan })
  }
  if (change.scheduledPlan) {
    await supabase.from("billing_accounts").upsert({
      account_id: session.user.id,
      plan_id: resolvePlan(currentPlan).id,
      status: billing.data?.status || "active",
      scheduled_plan_id: change.scheduledPlan,
      current_period_end: billing.data?.current_period_end || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" })
    return NextResponse.json({ scheduled: change.scheduledPlan, at: billing.data?.current_period_end || null })
  }
  return NextResponse.json({ unchanged: true })
}
