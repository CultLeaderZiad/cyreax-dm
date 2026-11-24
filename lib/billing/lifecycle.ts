import { DUNNING_GRACE_DAYS, TRIAL_DAYS, resolvePlan } from "@/lib/billing/plans"

export type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | "expired"

export interface BillingSnapshot {
  planId: string
  status: BillingStatus
  trialEndsAt: string | null
  periodEnd: string | null
  graceUntil: string | null
  dunningStep: number
  cancelAtPeriodEnd: boolean
  scheduledPlanId: string | null
  /** 'whop' rows follow Whop's membership status (webhook); no local dunning. */
  paymentProvider?: string | null
}

export type DunningAction =
  | { type: "none" }
  | { type: "trial_expired"; planId: "creator_free" }
  | { type: "mark_past_due"; graceUntil: string; step: number }
  | { type: "remind"; step: number }
  | { type: "suspend" }
  | { type: "apply_scheduled"; planId: string }
  | { type: "cancel" }

export function classifyChange(currentPlan: string, nextPlan: string): "upgrade" | "downgrade" | "same" {
  const current = resolvePlan(currentPlan)
  const next = resolvePlan(nextPlan)
  if (current.blocked && next.id !== "expired") return next.monthlyUsd > 0 ? "upgrade" : "same"
  if (current.id === next.id) return "same"
  if (next.monthlyUsd > current.monthlyUsd) return "upgrade"
  if (next.monthlyUsd < current.monthlyUsd) return "downgrade"
  return "downgrade"
}

/**
 * Upgrades wait for a successful charge. Downgrades apply at the period end,
 * or immediately when there is no paid period left (a trial or the free tier).
 */
export function schedulePlanChange(input: {
  currentPlan: string
  nextPlan: string
  periodEnd: string | null
  nowMs: number
}): { immediatePlan: string | null; scheduledPlan: string | null; requiresPayment: boolean } {
  const kind = classifyChange(input.currentPlan, input.nextPlan)
  const next = resolvePlan(input.nextPlan)
  if (kind === "same" || next.blocked) {
    return { immediatePlan: null, scheduledPlan: null, requiresPayment: false }
  }
  if (kind === "upgrade") {
    if (next.monthlyUsd <= 0) {
      return { immediatePlan: next.id, scheduledPlan: null, requiresPayment: false }
    }
    return { immediatePlan: null, scheduledPlan: null, requiresPayment: true }
  }
  const periodEnd = input.periodEnd ? Date.parse(input.periodEnd) : NaN
  if (!Number.isFinite(periodEnd) || periodEnd <= input.nowMs) {
    return { immediatePlan: next.id, scheduledPlan: null, requiresPayment: false }
  }
  return { immediatePlan: null, scheduledPlan: next.id, requiresPayment: false }
}

export function startTrial(input: {
  currentPlan: string
  requestedPlan: string
  alreadyTrialed: boolean
  nowMs: number
  /** Trial length the admin set for this plan; falls back to the catalog default. */
  trialDays?: number
}): { ok: true; planId: string; trialEndsAt: string; status: "trialing" } | { ok: false; error: string } {
  const requested = resolvePlan(input.requestedPlan)
  const days = input.trialDays ?? requested.limits.trialDays
  if (requested.blocked || requested.monthlyUsd <= 0 || days <= 0) {
    return { ok: false, error: "That plan does not include a trial." }
  }
  if (input.alreadyTrialed) return { ok: false, error: "This account has already used a trial." }
  const current = resolvePlan(input.currentPlan)
  const legacyTrial = input.currentPlan === "trial" || input.currentPlan === "creator_free" || input.currentPlan === "free" || input.currentPlan === "expired" || !input.currentPlan
  if (!legacyTrial && !current.blocked && current.monthlyUsd > 0) {
    return { ok: false, error: "A paid plan is already active." }
  }
  const ends = new Date(input.nowMs + days * 24 * 60 * 60 * 1000)
  return { ok: true, planId: requested.id, trialEndsAt: ends.toISOString(), status: "trialing" }
}

export function dunningAction(row: BillingSnapshot, nowMs: number): DunningAction {
  // Whop runs renewals, retries and cancellations itself and tells us by
  // webhook; local reminders or status changes would fight its state.
  // Access still ends at current_period_end via lib/billing/enforce.ts.
  if (row.paymentProvider === "whop") return { type: "none" }
  if (row.cancelAtPeriodEnd && row.periodEnd && Date.parse(row.periodEnd) <= nowMs) {
    return { type: "cancel" }
  }
  if (row.status === "active" && row.scheduledPlanId && row.periodEnd && Date.parse(row.periodEnd) <= nowMs) {
    return { type: "apply_scheduled", planId: resolvePlan(row.scheduledPlanId).id }
  }
  if (row.status === "trialing") {
    const ends = row.trialEndsAt ? Date.parse(row.trialEndsAt) : NaN
    if (Number.isFinite(ends) && ends <= nowMs) return { type: "trial_expired", planId: "creator_free" }
    return { type: "none" }
  }
  if (row.status === "active" && row.periodEnd && Date.parse(row.periodEnd) <= nowMs) {
    const graceUntil = new Date(nowMs + DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    return { type: "mark_past_due", graceUntil, step: 1 }
  }
  if (row.status === "past_due") {
    if (row.graceUntil && Date.parse(row.graceUntil) <= nowMs) return { type: "suspend" }
    if (row.dunningStep < 2) return { type: "remind", step: 2 }
  }
  return { type: "none" }
}

export function legacyTrialEnded(plan: string, trialEndsAt: string | null, trialExempt: boolean | null, nowMs: number): boolean {
  if (plan !== "trial" || trialExempt || !trialEndsAt) return false
  const ends = Date.parse(trialEndsAt)
  return Number.isFinite(ends) && ends <= nowMs
}

export const DEFAULT_TRIAL_DAYS = TRIAL_DAYS
