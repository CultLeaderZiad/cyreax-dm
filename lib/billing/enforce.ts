import { featureEnabled, limitFor, meterPeriod, resolvePlan, type FeatureKey, type MeterKey, type ResolvedPlan } from "@/lib/billing/plans"
import { channelSlots, judgeUsage, slotsAfterConnect, type ChannelConnection, type ChannelProfile, type UsageJudgement } from "@/lib/billing/usage"

export class PlanLimitError extends Error {
  code = "limit_hard"
  metric: MeterKey
  used: number
  limit: number
  constructor(decision: UsageJudgement) {
    super(decision.message)
    this.metric = decision.metric
    this.used = decision.used
    this.limit = decision.limit
  }
}

export interface AccountGate {
  id: string
  plan?: string | null
  role?: string | null
  trial_ends_at?: string | null
  trial_exempt?: boolean | null
}

function missing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table|column/i.test(message)
}

export async function loadAccount(supabase: any, accountId: string): Promise<AccountGate | null> {
  const { data, error } = await supabase.from("accounts").select("id, plan, role, trial_ends_at, trial_exempt").eq("id", accountId).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw error
  }
  return data
}

export async function accountIdForProfile(supabase: any, userId: string | number): Promise<string | null> {
  const { data, error } = await supabase.from("users").select("account_id").eq("id", userId).maybeSingle()
  if (error || !data?.account_id) return null
  return String(data.account_id)
}

async function billingRow(supabase: any, accountId: string): Promise<{ plan_id?: string; status?: string; trial_ends_at?: string | null } | null> {
  const { data, error } = await supabase.from("billing_accounts").select("plan_id, status, trial_ends_at").eq("account_id", accountId).maybeSingle()
  if (error) {
    if (missing(error)) return null
    return null
  }
  return data
}

/** The plan that limits apply to right now, including an ended trial. */
export async function resolveAccountPlan(supabase: any, account: AccountGate, nowMs = Date.now()): Promise<ResolvedPlan> {
  if (account.role === "admin") {
    const pro = resolvePlan("agency_pro")
    return { ...pro, limits: { ...pro.limits, workspaces: -1, channels: -1, contacts: -1, aiReplies: -1, broadcasts: -1, seats: -1 } }
  }
  const billing = await billingRow(supabase, account.id)
  if (billing?.status === "expired" || billing?.status === "canceled") return resolvePlan("expired")
  if (billing?.status === "trialing" && billing.trial_ends_at && Date.parse(billing.trial_ends_at) <= nowMs) {
    return resolvePlan("creator_free")
  }
  if (billing?.status === "active" || billing?.status === "past_due" || billing?.status === "trialing") {
    if (billing.plan_id) return resolvePlan(billing.plan_id)
  }
  if (account.plan === "trial" && account.trial_ends_at && !account.trial_exempt && Date.parse(account.trial_ends_at) <= nowMs) {
    return resolvePlan("creator_free")
  }
  return resolvePlan(account.plan)
}

async function countExact(query: any): Promise<number | null> {
  const { count, error } = await query
  if (error) {
    if (missing(error)) return null
    throw error
  }
  return count ?? 0
}

export async function measureUsage(supabase: any, accountId: string, metric: MeterKey, now = new Date(), workspaceId?: string | null): Promise<number> {
  if (metric === "workspaces") {
    const count = await countExact(supabase.from("workspaces").select("id", { count: "exact", head: true }).eq("owner_account_id", accountId))
    return count ?? 0
  }
  const profiles = await supabase.from("users").select("id, access_token, business_account_id").eq("account_id", accountId)
  if (profiles.error && !missing(profiles.error)) throw profiles.error
  const rows = profiles.error ? [] : profiles.data || []
  const ids = rows.map((row: any) => row.id).filter((id: unknown) => id != null)
  if (metric === "channels") {
    const connQuery = supabase.from("platform_connections").select("platform, page_id, external_account_id, metadata")
    const connections = ids.length
      ? await connQuery.or(`account_id.eq.${accountId},user_id.in.(${ids.join(",")})`)
      : await connQuery.eq("account_id", accountId)
    return channelSlots({
      profiles: rows.map((row: any) => ({ accessToken: row.access_token, businessAccountId: row.business_account_id ? String(row.business_account_id) : null })),
      connections: (connections.data || []).map((row: any) => ({
        platform: String(row.platform || ""),
        pageId: row.page_id,
        externalId: row.external_account_id,
        metadata: row.metadata,
      })),
    })
  }
  if (metric === "contacts") {
    if (!ids.length) return 0
    const count = await countExact(supabase.from("contacts").select("id", { count: "exact", head: true }).in("user_id", ids))
    return count ?? 0
  }
  if (metric === "seats") {
    if (workspaceId) {
      const members = await countExact(supabase.from("workspace_members").select("account_id", { count: "exact", head: true }).eq("workspace_id", workspaceId))
      const invited = await countExact(
        supabase.from("agency_team_members").select("id", { count: "exact", head: true }).eq("agency_account_id", accountId).eq("status", "invited"),
      )
      return (members ?? 1) + (invited ?? 0)
    }
    const invited = await countExact(supabase.from("agency_team_members").select("id", { count: "exact", head: true }).eq("agency_account_id", accountId))
    return (invited ?? 0) + 1
  }
  const period = meterPeriod(metric, now)
  const meter = await supabase.from("usage_meters").select("used").eq("account_id", accountId).eq("metric", metric === "aiReplies" ? "ai_replies" : "broadcasts").eq("period", period).maybeSingle()
  if (!meter.error && meter.data) return Number(meter.data.used || 0)
  if (metric === "broadcasts" && ids.length) {
    const monthStart = `${period}-01T00:00:00.000Z`
    const count = await countExact(supabase.from("broadcasts").select("id", { count: "exact", head: true }).in("user_id", ids).gte("created_at", monthStart))
    return count ?? 0
  }
  if (metric === "aiReplies" && ids.length) {
    const monthStart = `${period}-01T00:00:00.000Z`
    const count = await countExact(supabase.from("ai_answer_logs").select("id", { count: "exact", head: true }).in("user_id", ids).gte("created_at", monthStart))
    return count ?? 0
  }
  return 0
}

export async function assertWithinLimit(
  supabase: any,
  account: AccountGate,
  metric: MeterKey,
  adding = 1,
  workspaceId?: string | null,
  now = new Date(),
): Promise<UsageJudgement> {
  const plan = await resolveAccountPlan(supabase, account, now.getTime())
  const used = await measureUsage(supabase, account.id, metric, now, workspaceId)
  const decision = judgeUsage({
    metric,
    used,
    limit: limitFor(plan, metric),
    adding,
    blocked: plan.blocked,
  })
  if (!decision.allowed) throw new PlanLimitError(decision)
  return decision
}

export async function assertChannelConnect(
  supabase: any,
  account: AccountGate,
  addition: ChannelConnection | ({ kind: "instagram" } & ChannelProfile),
): Promise<UsageJudgement> {
  const plan = await resolveAccountPlan(supabase, account)
  const profiles = await supabase.from("users").select("id, access_token, business_account_id").eq("account_id", account.id)
  const rows = profiles.error ? [] : profiles.data || []
  const ids = rows.map((row: any) => row.id).filter((id: unknown) => id != null)
  const connQuery = supabase.from("platform_connections").select("platform, page_id, external_account_id, metadata")
  const connections = ids.length
    ? await connQuery.or(`account_id.eq.${account.id},user_id.in.(${ids.join(",")})`)
    : await connQuery.eq("account_id", account.id)
  const current = {
    profiles: rows.map((row: any) => ({ accessToken: row.access_token, businessAccountId: row.business_account_id ? String(row.business_account_id) : null })),
    connections: (connections.data || []).map((row: any) => ({
      platform: String(row.platform || ""),
      pageId: row.page_id,
      externalId: row.external_account_id,
      metadata: row.metadata,
    })),
  }
  const projected = slotsAfterConnect(current, addition)
  const decision = judgeUsage({ metric: "channels", used: projected.used, limit: limitFor(plan, "channels"), adding: projected.adding, blocked: plan.blocked })
  if (!decision.allowed) throw new PlanLimitError(decision)
  return decision
}

export async function assertFeature(supabase: any, account: AccountGate, feature: FeatureKey): Promise<void> {
  const plan = await resolveAccountPlan(supabase, account)
  if (featureEnabled(plan, feature)) return
  const label = feature === "whiteLabel" ? "White-label" : "API access"
  throw new PlanLimitError({
    metric: "workspaces",
    used: 0,
    limit: 0,
    adding: 1,
    level: "hard",
    allowed: false,
    remaining: 0,
    message: `${label} is not included in the ${plan.name} plan.`,
  })
}

export async function incrementMeter(supabase: any, accountId: string, metric: "aiReplies" | "broadcasts", delta = 1, now = new Date()): Promise<number> {
  const period = meterPeriod(metric, now)
  const key = metric === "aiReplies" ? "ai_replies" : "broadcasts"
  const rpc = await supabase.rpc("increment_usage", { p_account: accountId, p_metric: key, p_period: period, p_delta: delta })
  if (!rpc.error && typeof rpc.data === "number") return rpc.data
  const current = await measureUsage(supabase, accountId, metric, now)
  const next = current + delta
  const saved = await supabase.from("usage_meters").upsert(
    { account_id: accountId, metric: key, period, used: next, updated_at: now.toISOString() },
    { onConflict: "account_id,metric,period" },
  )
  if (saved?.error && !missing(saved.error)) console.warn("[billing] meter upsert failed:", saved.error.message)
  return next
}

export function limitPayload(error: PlanLimitError) {
  return { error: error.message, code: error.code, metric: error.metric, used: error.used, limit: error.limit }
}

export type { ChannelConnection, ChannelProfile }
