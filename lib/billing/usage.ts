import { SOFT_LIMIT_RATIO, type MeterKey } from "@/lib/billing/plans"

export type UsageLevel = "ok" | "soft" | "hard"

export interface UsageJudgement {
  metric: MeterKey
  used: number
  limit: number
  adding: number
  level: UsageLevel
  allowed: boolean
  remaining: number | null
  message: string
}

const LABELS: Record<MeterKey, string> = {
  workspaces: "Workspaces",
  channels: "Channels",
  contacts: "Contacts",
  aiReplies: "AI replies",
  broadcasts: "Broadcasts",
  seats: "Team seats",
}

export function judgeUsage(input: {
  metric: MeterKey
  used: number
  limit: number
  adding?: number
  softRatio?: number
  blocked?: boolean
}): UsageJudgement {
  const adding = input.adding ?? 0
  const used = Math.max(0, input.used)
  const limit = input.limit
  const label = LABELS[input.metric]
  if (input.blocked && adding > 0) {
    return {
      metric: input.metric,
      used,
      limit,
      adding,
      level: "hard",
      allowed: false,
      remaining: 0,
      message: `${label} are paused until the subscription is active.`,
    }
  }
  if (limit < 0) {
    return {
      metric: input.metric,
      used,
      limit,
      adding,
      level: "ok",
      allowed: true,
      remaining: null,
      message: "",
    }
  }
  const next = used + adding
  if (next > limit) {
    return {
      metric: input.metric,
      used,
      limit,
      adding,
      level: "hard",
      allowed: false,
      remaining: Math.max(0, limit - used),
      message: `${label} limit reached (${used}/${limit}). Upgrade to add more.`,
    }
  }
  const ratio = limit === 0 ? 0 : next / limit
  const soft = ratio >= (input.softRatio ?? SOFT_LIMIT_RATIO) && next > 0 && limit > 0
  return {
    metric: input.metric,
    used,
    limit,
    adding,
    level: soft ? "soft" : "ok",
    allowed: true,
    remaining: limit - next,
    message: soft ? `${label} are at ${Math.round(ratio * 100)}% of the plan (${next}/${limit}).` : "",
  }
}

export interface ChannelProfile {
  accessToken?: string | null
  businessAccountId?: string | null
}

export interface ChannelConnection {
  platform: string
  pageId?: string | null
  externalId?: string | null
  metadata?: any
}

const PLACEHOLDERS = new Set([
  "",
  "facebook_managed",
  "telegram_managed",
  "workspace_managed",
  "webchat_managed",
  "TEST_TOKEN_NOT_REAL",
  "revoked_meta",
])

export function isConnectedToken(token: string | null | undefined): boolean {
  return Boolean(token) && !PLACEHOLDERS.has(String(token))
}

function slotKey(connection: ChannelConnection): string {
  const id = connection.pageId || connection.externalId || "unknown"
  if (connection.platform === "facebook" || connection.platform === "messenger") return `meta_page:${id}`
  return `${connection.platform}:${id}`
}

/** Distinct connected channels. A Facebook page and its Messenger row count once. Personal user profile rows do not consume channel slots. */
export function channelSlots(input: { profiles?: ChannelProfile[]; connections?: ChannelConnection[] }): number {
  const keys = new Set<string>()
  for (const profile of input.profiles || []) {
    if (!isConnectedToken(profile.accessToken)) continue
    keys.add(`instagram:${profile.businessAccountId || "connected"}`)
  }
  for (const connection of input.connections || []) {
    if (!connection.platform) continue
    if (connection.metadata?.is_user_profile) continue
    keys.add(slotKey(connection))
  }
  return keys.size
}

export function slotsAfterConnect(
  current: { profiles?: ChannelProfile[]; connections?: ChannelConnection[] },
  addition: ChannelConnection | ChannelProfile & { kind: "instagram" },
): { used: number; adding: number } {
  const used = channelSlots(current)
  if ("kind" in addition && addition.kind === "instagram") {
    const next = channelSlots({
      profiles: [...(current.profiles || []), { accessToken: "connected", businessAccountId: addition.businessAccountId }],
      connections: current.connections,
    })
    return { used, adding: Math.max(0, next - used) }
  }
  const connection = addition as ChannelConnection
  if (connection.metadata?.is_user_profile) {
    return { used, adding: 0 }
  }
  const next = channelSlots({
    profiles: current.profiles,
    connections: [...(current.connections || []), connection],
  })
  return { used, adding: Math.max(0, next - used) }
}
