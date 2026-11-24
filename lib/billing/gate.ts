/**
 * When is a customer's dashboard replaced by the "choose a plan or log out"
 * screen? Pure so it can be tested; the dashboard layout calls it.
 *
 * - admins and trial-exempt accounts are never gated;
 * - a finished free trial is gated once its 12-hour grace window (TRIAL_GRACE_HOURS) has passed;
 * - a paid account whose subscription is no longer valid is gated.
 */
export function gateReason(input: {
  role?: string | null
  trialExempt?: boolean | null
  plan?: string | null
  isTrialExpired?: boolean
  isPastDeadline?: boolean
  hasValidPayment?: boolean
}): "trial" | "subscription" | null {
  if (input.role === "admin" || input.trialExempt) return null
  if (input.plan === "trial" && input.isTrialExpired && input.isPastDeadline) return "trial"
  if (input.plan && input.plan !== "trial" && !input.hasValidPayment && input.isPastDeadline) return "subscription"
  return null
}
