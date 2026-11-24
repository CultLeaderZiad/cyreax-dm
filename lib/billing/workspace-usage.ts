import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { resolvePlan, limitFor, type MeterKey, type ResolvedPlan, PLAN_CATALOG } from "@/lib/billing/plans"
import { measureUsage, resolveAccountPlan } from "@/lib/billing/enforce"

export interface WorkspaceUsageResult {
  workspace: {
    id: string
    name: string
  }
  plan: {
    id: string
    name: string
    status: string
    priceFormatted: string
    renewsFormatted: string
    currency: string
    renewalDate: string | null
    isPlanLimitHit: boolean
  }
  limits: {
    aiReplies: number
    channels: number
    contacts: number
    seats: number
    workspaces: number
  }
  used: {
    aiReplies: number
    channels: number
    contacts: number
    seats: number
    workspaces: number
  }
  alerts: {
    hasAlert: boolean
    severity: "none" | "warning" | "hard_block"
    message: string
    metric: "channels" | "aiReplies" | "contacts" | "seats" | null
    ratio: number
  }
}

/**
 * Single server source of truth for workspace usage and limits.
 * Scoped to the workspace and account on the server.
 */
export async function getWorkspaceUsage(
  workspaceId?: string | null,
  overrideAccountId?: string | null,
  customSupabase?: any
): Promise<WorkspaceUsageResult> {
  const supabase = customSupabase || (await getSupabaseBypassClient())

  let accountId = overrideAccountId || null
  let workspaceName = "Workspace"

  // 1. Resolve workspace and owner account
  if (workspaceId) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, name, owner_account_id")
      .eq("id", workspaceId)
      .maybeSingle()

    if (ws) {
      workspaceName = ws.name || "Workspace"
      if (!accountId && ws.owner_account_id) {
        accountId = ws.owner_account_id
      }
    }
  }

  // Fallback to first account if still unknown
  if (!accountId) {
    const { data: firstAcc } = await supabase.from("accounts").select("id").limit(1).maybeSingle()
    accountId = firstAcc?.id || "default"
  }

  const finalAccountId: string = accountId || "default"

  // 2. Load account and billing record
  const { data: accountData } = await supabase
    .from("accounts")
    .select("id, plan, role, trial_ends_at, trial_exempt")
    .eq("id", finalAccountId)
    .maybeSingle()

  const accountGate = accountData || { id: finalAccountId, plan: "creator" }
  const resolvedPlan: ResolvedPlan = await resolveAccountPlan(supabase, accountGate)

  const { data: billing } = await supabase
    .from("billing_accounts")
    .select("status, current_period_end, trial_ends_at, interval, provider, plan_id")
    .eq("account_id", finalAccountId)
    .maybeSingle()

  // 3. Measure real metrics
  const now = new Date()
  const [aiRepliesUsed, channelsUsed, contactsUsed, seatsUsed, workspacesUsed] = await Promise.all([
    measureUsage(supabase, finalAccountId, "aiReplies", now, workspaceId),
    measureUsage(supabase, finalAccountId, "channels", now, workspaceId),
    measureUsage(supabase, finalAccountId, "contacts", now, workspaceId),
    measureUsage(supabase, finalAccountId, "seats", now, workspaceId),
    measureUsage(supabase, finalAccountId, "workspaces", now, workspaceId),
  ])

  const limits = {
    aiReplies: limitFor(resolvedPlan, "aiReplies"),
    channels: limitFor(resolvedPlan, "channels"),
    contacts: limitFor(resolvedPlan, "contacts"),
    seats: limitFor(resolvedPlan, "seats"),
    workspaces: limitFor(resolvedPlan, "workspaces"),
  }

  const used = {
    aiReplies: aiRepliesUsed,
    channels: channelsUsed,
    contacts: contactsUsed,
    seats: seatsUsed,
    workspaces: workspacesUsed,
  }

  // 4. Renewal & Plan formatting
  const periodEnd = billing?.current_period_end || billing?.trial_ends_at || accountGate.trial_ends_at
  let renewsFormatted = "Active plan"
  if (periodEnd) {
    const d = new Date(periodEnd)
    if (!isNaN(d.getTime())) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      renewsFormatted = `Renews ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`
    }
  }

  const isEgp = true // Primary region currency for the Egyptian market default, can be dynamic
  const priceFormatted = isEgp
    ? `EGP ${new Intl.NumberFormat("en-US").format(1450)}/mo`
    : `$${resolvedPlan.monthlyUsd}/mo`

  const status = billing?.status || (accountGate.plan === "trial" ? "trialing" : resolvedPlan.blocked ? "expired" : "active")

  // 5. Evaluate Alerts (find most severe metric limit)
  const metricChecks: Array<{
    metric: "channels" | "aiReplies" | "contacts" | "seats"
    name: string
    used: number
    limit: number
    ratio: number
  }> = [
    {
      metric: "channels",
      name: "Channels",
      used: used.channels,
      limit: limits.channels,
      ratio: limits.channels > 0 ? used.channels / limits.channels : 0,
    },
    {
      metric: "aiReplies",
      name: "AI replies",
      used: used.aiReplies,
      limit: limits.aiReplies,
      ratio: limits.aiReplies > 0 ? used.aiReplies / limits.aiReplies : 0,
    },
    {
      metric: "contacts",
      name: "Contacts",
      used: used.contacts,
      limit: limits.contacts,
      ratio: limits.contacts > 0 ? used.contacts / limits.contacts : 0,
    },
    {
      metric: "seats",
      name: "Seats",
      used: used.seats,
      limit: limits.seats,
      ratio: limits.seats > 0 ? used.seats / limits.seats : 0,
    },
  ]

  // Sort by highest ratio first
  metricChecks.sort((a, b) => b.ratio - a.ratio)
  const top = metricChecks[0]

  let alertInfo: WorkspaceUsageResult["alerts"] = {
    hasAlert: false,
    severity: "none",
    message: "",
    metric: null,
    ratio: 0,
  }

  if (status === "expired" || resolvedPlan.blocked) {
    alertInfo = {
      hasAlert: true,
      severity: "hard_block",
      message: "Subscription expired · Automations paused",
      metric: null,
      ratio: 1,
    }
  } else if (top && top.limit > 0 && top.used >= top.limit) {
    alertInfo = {
      hasAlert: true,
      severity: top.ratio > 1 ? "hard_block" : "warning",
      message: `${top.name} at plan limit · ${top.used}/${top.limit}`,
      metric: top.metric,
      ratio: top.ratio,
    }
  } else if (top && top.limit > 0 && top.ratio >= 0.8) {
    alertInfo = {
      hasAlert: true,
      severity: "warning",
      message: `${top.name} at ${Math.round(top.ratio * 100)}% of limit`,
      metric: top.metric,
      ratio: top.ratio,
    }
  }

  return {
    workspace: {
      id: workspaceId || "default",
      name: workspaceName,
    },
    plan: {
      id: resolvedPlan.id,
      name: resolvedPlan.name,
      status,
      priceFormatted,
      renewsFormatted,
      currency: "EGP",
      renewalDate: periodEnd ? new Date(periodEnd).toISOString() : null,
      isPlanLimitHit: alertInfo.hasAlert,
    },
    limits,
    used,
    alerts: alertInfo,
  }
}
