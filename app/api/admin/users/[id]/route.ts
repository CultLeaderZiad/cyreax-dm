export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { activatePlan, startTrialPlan, deactivatePlan } from "@/lib/billing/activation"
import { PLAN_CATALOG, TRIAL_DAYS, TRIAL_PLAN_ID } from "@/lib/billing/plans"

/** Plans an admin can put an account on. Everything else stays a legacy value. */
const TIER_IDS = new Set(PLAN_CATALOG.filter((plan) => !plan.hidden).map((plan) => plan.id))
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * PATCH /api/admin/users/[id]
 * Admin-only: updates role, plan, is_flagged, flagged_reason for an account.
 * Entitlement changes route through billing_accounts and mirror to users + subscriptions.
 * Logs to admin_audit_log (int64).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin(request)
  if (result.response) return result.response
  const adminAccount = result.user

  const { id: targetAccountId } = await params
  if (!targetAccountId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 })
  }

  try {
    const supabase = await getSupabaseBypassClient()
    const body = await request.json()

    const allowedFields = ["role", "plan", "is_flagged", "flagged_reason", "is_banned", "banned_reason", "trial_ends_at"]
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    // A real tier (Starter / Pro / Agency) is written by activatePlan, which also
    // keeps the legacy accounts.plan / users.plan columns valid. Those columns
    // only accept trial / monthly / one_time / expired.
    const requestedPlan: string | undefined = updates.plan
    const isTier = typeof requestedPlan === "string" && TIER_IDS.has(requestedPlan)
    if (isTier) delete updates.plan
    // "Grant for N days": the paid period the admin gives (default one month).
    const grantDays = Number.isInteger(body.grant_days) && body.grant_days >= 1 && body.grant_days <= 3650 ? Number(body.grant_days) : 30
    if (Object.keys(updates).length === 0 && !isTier) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    // Fetch current account state for audit diff
    const { data: targetAccount, error: fetchError } = await supabase
      .from("accounts")
      .select("id, email, role, plan, is_flagged, flagged_reason, is_banned, banned_reason, trial_ends_at")
      .eq("id", targetAccountId)
      .single()

    if (fetchError || !targetAccount) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Prevent self-demotion and demoting the last remaining admin
    if (updates.role !== undefined) {
      if (adminAccount.id === targetAccountId && updates.role !== targetAccount.role) {
        return NextResponse.json({ error: "Admins cannot modify their own role" }, { status: 400 })
      }
      if (targetAccount.role === "admin" && updates.role !== "admin") {
        const { count } = await supabase
          .from("accounts")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: "Cannot demote the last remaining admin" }, { status: 400 })
        }
      }
    }

    if (isTier && !targetAccount) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Apply the update to accounts (source of truth)
    const { error: updateError } = await supabase
      .from("accounts")
      .update(updates)
      .eq("id", targetAccountId)

    if (updateError) throw updateError

    // Resolve the linked users row (int64) for plan mirroring + audit log
    let targetUserId: number | null = null
    const { data: targetUser } = await supabase
      .from("users")
      .select("id")
      .eq("account_id", targetAccountId)
      .maybeSingle()
    targetUserId = targetUser?.id ?? null

    // Synchronize entitlement via shared billing module (billing_accounts source of truth)
    if (requestedPlan !== undefined) {
      try {
        if (requestedPlan === "expired" || requestedPlan === "canceled") {
          await deactivatePlan({ accountId: targetAccountId, source: "admin" }, supabase)
        } else if (requestedPlan === "trial") {
          await startTrialPlan({
            accountId: targetAccountId,
            planId: TRIAL_PLAN_ID,
            trialEndsAt: updates.trial_ends_at || targetAccount.trial_ends_at || new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString()
          }, supabase)
        } else {
          await activatePlan({
            accountId: targetAccountId,
            planId: requestedPlan,
            interval: "month",
            source: "admin",
            periodEnd: isTier ? new Date(Date.now() + grantDays * DAY_MS).toISOString() : undefined,
          }, supabase)
        }
      } catch (billingErr: any) {
        console.warn("[admin/users/[id]] billing_accounts sync failed:", billingErr?.message)
        if (isTier) return NextResponse.json({ error: "Could not change the plan" }, { status: 502 })
      }
    } else if (updates.trial_ends_at !== undefined) {
      await supabase
        .from("billing_accounts")
        .update({ trial_ends_at: updates.trial_ends_at, updated_at: new Date().toISOString() })
        .eq("account_id", targetAccountId)
    }

    // Mirror plan and trial_ends_at to users + subscriptions
    if ((updates.plan !== undefined || updates.trial_ends_at !== undefined) && targetUserId !== null) {
      const userUpdates: Record<string, any> = {}
      if (updates.plan !== undefined) userUpdates.plan = updates.plan
      if (updates.trial_ends_at !== undefined) userUpdates.trial_ends_at = updates.trial_ends_at
      
      if (Object.keys(userUpdates).length > 0) {
        await supabase.from("users").update(userUpdates).eq("id", targetUserId)
      }

      if (updates.plan !== undefined) {
        const { data: existingSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", targetUserId)
          .maybeSingle()
        if (existingSub) {
          await supabase.from("subscriptions").update({
            plan_type: updates.plan,
            status: updates.plan === "expired" ? "canceled" : "active",
            updated_at: new Date().toISOString(),
          }).eq("id", existingSub.id)
        } else {
          await supabase.from("subscriptions").insert({
            user_id: targetUserId,
            plan_type: updates.plan,
            status: updates.plan === "expired" ? "canceled" : "active",
          })
        }
      }
    }

    // Resolve admin's int64 users.id for the audit log
    let adminUserId: number | null = null
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .eq("account_id", adminAccount.id)
      .maybeSingle()
    adminUserId = adminUser?.id ?? null

    // Write to audit log
    const auditDetails: Record<string, any> = { before: {}, after: {} }
    if (isTier) {
      auditDetails.before.plan = targetAccount.plan
      auditDetails.after.plan = requestedPlan
      auditDetails.after.grant_days = grantDays
    }
    for (const field of Object.keys(updates)) {
      if (field === "updated_at") continue
      auditDetails.before[field] = (targetAccount as any)[field]
      auditDetails.after[field] = updates[field]
    }

    if (adminUserId !== null && targetUserId !== null) {
      await supabase.from("admin_audit_log").insert({
        admin_user_id: adminUserId,
        action: "update_user",
        target_user_id: targetUserId,
        details: auditDetails,
      })
    }

    return NextResponse.json({ success: true, updated: isTier ? { ...updates, plan: requestedPlan } : updates })
  } catch (error: any) {
    console.error("[admin/users/[id]] Error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}
