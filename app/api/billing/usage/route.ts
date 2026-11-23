export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { featureEnabled, limitFor, type MeterKey } from "@/lib/billing/plans"
import { activePeriodValid, measureUsage, resolveAccountPlan } from "@/lib/billing/enforce"
import { judgeUsage } from "@/lib/billing/usage"

const METRICS: MeterKey[] = ["workspaces", "channels", "contacts", "aiReplies", "broadcasts", "seats"]

export async function GET(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const supabase = await getSupabaseBypassClient()
  const account = session.user
  const plan = await resolveAccountPlan(supabase, account)
  let billing = await supabase.from("billing_accounts").select("status, trial_ends_at, current_period_end, scheduled_plan_id, grace_until, dunning_step, interval, provider, display_plan_id, payment_provider, cancel_at_period_end").eq("account_id", account.id).maybeSingle()
  if (billing.error) {
    // Before migration 20261117120200 there is no display_plan_id column.
    billing = await supabase.from("billing_accounts").select("status, trial_ends_at, current_period_end, scheduled_plan_id, grace_until, dunning_step, interval, provider").eq("account_id", account.id).maybeSingle()
  }
  // The plans row (name and EGP prices from Admin -> Plans) that was bought.
  let displayPlan: Record<string, unknown> | null = null
  const columns = "id, name, price_egp, price_yearly_egp, price_usd, price_yearly, billing_cycle"
  const displayId = (billing.data as any)?.display_plan_id
  if (displayId) {
    displayPlan = (await supabase.from("plans").select(columns).eq("id", displayId).maybeSingle()).data
  } else if (!plan.blocked && plan.id !== "creator_free") {
    const rows = (await supabase.from("plans").select(columns).eq("catalog_plan_id", plan.id).limit(1)).data
    displayPlan = rows?.[0] ?? null
  }
  // An active row past its paid period is expired even before the cron runs.
  const rawStatus = billing.data?.status
  const status = (rawStatus === "active" || rawStatus === "past_due") && billing.data && !activePeriodValid(billing.data as any) ? "expired" : rawStatus
  const metrics = []
  for (const metric of METRICS) {
    const used = await measureUsage(supabase, account.id, metric, new Date(), session.workspace?.id)
    metrics.push(judgeUsage({ metric, used, limit: limitFor(plan, metric), adding: 0, blocked: plan.blocked }))
  }
  return NextResponse.json({
    plan: {
      id: plan.id,
      name: plan.name,
      audience: plan.audience,
      monthlyUsd: plan.monthlyUsd,
      yearlyUsd: plan.yearlyUsd,
      blocked: plan.blocked,
      limits: plan.limits,
    },
    displayPlan,
    interval: billing.data?.interval || null,
    provider: billing.data?.provider || null,
    // 'whop' | 'manual': decides "Manage subscription" vs "Renew by wallet".
    paymentProvider: (billing.data as any)?.payment_provider || null,
    cancelAtPeriodEnd: Boolean((billing.data as any)?.cancel_at_period_end),
    status: status || (account.plan === "trial" ? "trialing" : plan.blocked ? "expired" : "active"),
    trialEndsAt: billing.data?.trial_ends_at || account.trial_ends_at || null,
    periodEnd: billing.data?.current_period_end || null,
    scheduledPlanId: billing.data?.scheduled_plan_id || null,
    graceUntil: billing.data?.grace_until || null,
    dunningStep: billing.data?.dunning_step || 0,
    features: {
      whiteLabel: featureEnabled(plan, "whiteLabel"),
      apiAccess: featureEnabled(plan, "apiAccess"),
    },
    metrics,
    warnings: metrics.filter((metric) => metric.level !== "ok").map((metric) => metric.message),
  })
}
