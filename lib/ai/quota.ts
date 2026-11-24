/**
 * Monthly AI request quota per plan (Admin -> Plans -> "AI requests / month").
 *
 * Covers every AI call that is not an auto-reply (those are metered by the
 * `aiReplies` limit in the message pipeline): recommendations, the Growth
 * Agent, analytics. Usage is counted from `ai_usage_log`, which every provider
 * call already writes to, so there is one source of truth.
 */
import { resolveAccountPlan } from "@/lib/billing/enforce"

/** Features that spend the `aiReplies` meter instead of this quota. */
export const REPLY_FEATURES = new Set(["auto_reply"])

export class AiQuotaError extends Error {
  readonly code = "AI_QUOTA_EXCEEDED"
  readonly used: number
  readonly limit: number
  constructor(used: number, limit: number) {
    super(`Monthly AI request limit reached (${used}/${limit}). Upgrade your plan to continue.`)
    this.name = "AiQuotaError"
    this.used = used
    this.limit = limit
  }
}

export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Pure decision: -1 = unlimited, 0 = none included. */
export function judgeAiQuota(used: number, limit: number): { allowed: boolean; remaining: number } {
  if (limit < 0) return { allowed: true, remaining: Infinity }
  return { allowed: used < limit, remaining: Math.max(0, limit - used) }
}

export async function aiRequestsUsed(supabase: any, accountId: string, now = new Date()): Promise<number> {
  const profiles = await supabase.from("users").select("id").eq("account_id", accountId)
  if (profiles.error) throw profiles.error
  const ids = (profiles.data || []).map((row: any) => row.id).filter((id: unknown) => id != null)
  if (!ids.length) return 0
  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .in("user_id", ids)
    .not("feature", "in", `(${[...REPLY_FEATURES].join(",")})`)
    .gte("created_at", monthStart(now))
  if (error) throw error
  return count ?? 0
}

/**
 * Throws AiQuotaError when the account has used its plan's monthly allowance.
 * Fails closed on a database error (no unbounded spend), and blocks accounts
 * whose trial or subscription has ended.
 */
export async function assertAiQuota(supabase: any, account: { id: string; plan?: string | null; role?: string | null; trial_ends_at?: string | null; trial_exempt?: boolean | null }, feature: string, now = new Date()): Promise<void> {
  if (REPLY_FEATURES.has(feature)) return
  const plan = await resolveAccountPlan(supabase, account, now.getTime())
  if (plan.blocked) throw new AiQuotaError(0, 0)
  const limit = plan.limits.aiRequests
  if (limit < 0) return
  const used = await aiRequestsUsed(supabase, account.id, now)
  if (!judgeAiQuota(used, limit).allowed) throw new AiQuotaError(used, limit)
}
