export const dynamic = "force-dynamic"
export const maxDuration = 60

import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { dunningAction, type BillingSnapshot } from "@/lib/billing/lifecycle"

function addInterval(fromMs: number, interval: string): string {
  const date = new Date(fromMs)
  if (interval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1)
  else date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString()
}

export async function GET(request: NextRequest) {
  const denied = unauthorizedCronResponse(request)
  if (denied) return denied
  const supabase = await getSupabaseBypassClient()
  const rows = await supabase.from("billing_accounts").select("*").limit(200)
  if (rows.error) return NextResponse.json({ error: rows.error.message, updated: 0 })
  const now = Date.now()
  let updated = 0
  for (const row of rows.data || []) {
    const snapshot: BillingSnapshot = {
      planId: row.plan_id,
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      periodEnd: row.current_period_end,
      graceUntil: row.grace_until,
      dunningStep: Number(row.dunning_step || 0),
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      scheduledPlanId: row.scheduled_plan_id,
    }
    const action = dunningAction(snapshot, now)
    if (action.type === "none") continue
    if (action.type === "remind") {
      await supabase.from("billing_accounts").update({ dunning_step: action.step, updated_at: new Date(now).toISOString() }).eq("account_id", row.account_id)
    } else if (action.type === "mark_past_due") {
      await supabase.from("billing_accounts").update({
        status: "past_due",
        grace_until: action.graceUntil,
        dunning_step: action.step,
        updated_at: new Date(now).toISOString(),
      }).eq("account_id", row.account_id)
    } else if (action.type === "suspend") {
      await supabase.from("billing_accounts").update({ status: "expired", dunning_step: 3, updated_at: new Date(now).toISOString() }).eq("account_id", row.account_id)
      await supabase.from("accounts").update({ plan: "expired", updated_at: new Date(now).toISOString() }).eq("id", row.account_id)
    } else if (action.type === "trial_expired" || action.type === "cancel") {
      await supabase.from("billing_accounts").update({
        plan_id: "creator_free",
        status: "active",
        trial_ends_at: row.trial_ends_at,
        current_period_end: null,
        scheduled_plan_id: null,
        cancel_at_period_end: false,
        grace_until: null,
        updated_at: new Date(now).toISOString(),
      }).eq("account_id", row.account_id)
      await supabase.from("accounts").update({ plan: "creator_free", updated_at: new Date(now).toISOString() }).eq("id", row.account_id)
    } else if (action.type === "apply_scheduled") {
      await supabase.from("billing_accounts").update({
        plan_id: action.planId,
        status: "active",
        scheduled_plan_id: null,
        current_period_end: addInterval(now, row.interval || "month"),
        updated_at: new Date(now).toISOString(),
      }).eq("account_id", row.account_id)
      await supabase.from("accounts").update({ plan: action.planId, updated_at: new Date(now).toISOString() }).eq("id", row.account_id)
    }
    updated += 1
  }
  const overdue = await supabase.from("client_invoices").select("id, due_at, status").eq("status", "open").limit(200)
  let invoices = 0
  for (const invoice of overdue.data || []) {
    if (invoice.due_at && Date.parse(invoice.due_at) + 3 * 24 * 60 * 60 * 1000 <= now) {
      await supabase.from("client_invoices").update({ status: "past_due" }).eq("id", invoice.id)
      invoices += 1
    }
  }
  return NextResponse.json({ updated, invoices })
}
