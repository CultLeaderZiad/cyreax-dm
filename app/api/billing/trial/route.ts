export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { startTrial } from "@/lib/billing/lifecycle"
import { applyEntitlements, resolvePlan } from "@/lib/billing/plans"
import { startTrialPlan } from "@/lib/billing/activation"

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const body = await request.json().catch(() => ({}))
  const supabase = await getSupabaseBypassClient()
  const existing = await supabase.from("billing_accounts").select("trial_ends_at, status, plan_id").eq("account_id", session.user.id).maybeSingle()

  // The plan can be named by its plans.id (what the pricing cards link to) or by its tier id.
  const key = String(body.planId || "")
  let tier = key
  if (/^[0-9a-f-]{36}$/i.test(key)) {
    const row = await supabase.from("plans").select("catalog_plan_id, is_active, is_contact_sales").eq("id", key).maybeSingle()
    if (!row.data || !row.data.is_active || row.data.is_contact_sales || !row.data.catalog_plan_id) return NextResponse.json({ error: "Unknown plan" }, { status: 404 })
    tier = row.data.catalog_plan_id
  }
  const base = resolvePlan(tier)
  if (base.hidden) return NextResponse.json({ error: "Unknown plan" }, { status: 404 })
  // The admin's trial length for this tier (Admin -> Plans), else the catalog default.
  const overrides = await supabase.from("plans").select("entitlements").eq("catalog_plan_id", base.id).not("entitlements", "is", null).limit(1)
  const trialDays = applyEntitlements(base, overrides.data?.[0]?.entitlements).limits.trialDays

  // One trial per account: a billing trial that was started, or a sign-up trial that has already run out, counts.
  const legacyEnd = session.user.trial_ends_at ? Date.parse(session.user.trial_ends_at) : NaN
  const decision = startTrial({
    currentPlan: session.user.plan || "trial",
    requestedPlan: base.id,
    alreadyTrialed: Boolean(existing.data?.trial_ends_at) || (Number.isFinite(legacyEnd) && legacyEnd <= Date.now()),
    nowMs: Date.now(),
    trialDays,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 })
  try {
    await startTrialPlan({ accountId: session.user.id, planId: decision.planId, trialEndsAt: decision.trialEndsAt })
  } catch (error: any) {
    console.error("[billing/trial] activation failed:", error?.message ?? error)
    return NextResponse.json({ error: "Could not start the trial." }, { status: 503 })
  }
  return NextResponse.json({ planId: decision.planId, trialEndsAt: decision.trialEndsAt, status: "trialing" })
}
