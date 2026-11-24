/**
 * Sellable plan catalog for creators and agencies.
 * This file is the limit source of truth. The `plans` table is still the
 * public pricing display; enforcement reads these numbers.
 *
 * A limit of -1 means unlimited. Monthly meters are AI replies and broadcasts.
 * Workspaces, channels, contacts, and seats are current counts.
 */

import { BRAND } from "@/lib/brand"

export type PlanAudience = "creator" | "agency"
export type MeterKey = "workspaces" | "channels" | "contacts" | "aiReplies" | "broadcasts" | "seats"
export type FeatureKey = "whiteLabel" | "apiAccess" | "aiAgent"
export type InsightsLevel = "none" | "weekly" | "daily"

export interface PlanLimits {
  workspaces: number
  channels: number
  contacts: number
  aiReplies: number
  broadcasts: number
  seats: number
  whiteLabel: boolean
  apiAccess: boolean
  /** The AI Growth Agent chat (Pro and Agency). */
  aiAgent: boolean
  /** How often AI Recommendations refresh. */
  insights: InsightsLevel
}

export interface PlanDefinition {
  id: string
  name: string
  audience: PlanAudience
  description: string
  monthlyUsd: number
  yearlyUsd: number
  trialDays: number
  limits: PlanLimits
  /** Account.plan values that resolve to this tier, including legacy slugs. */
  aliases: string[]
  /** Not sold and not offered in Admin -> Plans (internal tiers). */
  hidden?: boolean
}

export const SOFT_LIMIT_RATIO = 0.8
/** Free trial for every new account: no card, Pro features. */
export const TRIAL_DAYS = 7
/** The tier a running trial uses (Pro). */
export const TRIAL_PLAN_ID = "creator_plus"
export const DUNNING_GRACE_DAYS = 7

/**
 * Starter, Pro and Agency are the sellable tiers. The ids stay "creator",
 * "creator_plus" and "agency" because billing_accounts.plan_id already stores
 * them. These numbers are the defaults: Admin -> Plans can override any of
 * them per plan (plans.entitlements), see applyEntitlements().
 */
export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: "creator_free",
    name: "Free",
    audience: "creator",
    description: `One channel and a small contact list, so a creator can try ${BRAND.name}.`,
    monthlyUsd: 0,
    yearlyUsd: 0,
    trialDays: 0,
    limits: {
      workspaces: 1,
      channels: 1,
      contacts: 500,
      aiReplies: 100,
      broadcasts: 0,
      seats: 1,
      whiteLabel: false,
      apiAccess: false,
      aiAgent: false,
      insights: "none",
    },
    aliases: ["creator_free", "free"],
    hidden: true,
  },
  {
    id: "creator",
    name: "Starter",
    audience: "creator",
    description: "For a creator getting started: two channels, automations and weekly AI recommendations.",
    monthlyUsd: 19.99,
    yearlyUsd: 199.9,
    trialDays: TRIAL_DAYS,
    limits: {
      workspaces: 1,
      channels: 2,
      contacts: 2000,
      aiReplies: 1000,
      broadcasts: 2,
      seats: 1,
      whiteLabel: false,
      apiAccess: false,
      aiAgent: false,
      insights: "weekly",
    },
    aliases: ["creator", "starter", "monthly"],
  },
  {
    id: "creator_plus",
    name: "Pro",
    audience: "creator",
    description: "For growing creators and small businesses: five channels, the AI Growth Agent and daily recommendations.",
    monthlyUsd: 29.99,
    yearlyUsd: 299.9,
    trialDays: TRIAL_DAYS,
    limits: {
      workspaces: 1,
      channels: 5,
      contacts: 10000,
      aiReplies: 5000,
      broadcasts: 10,
      seats: 3,
      whiteLabel: false,
      apiAccess: true,
      aiAgent: true,
      insights: "daily",
    },
    // A running free trial uses Pro, so a new account can try the AI Agent.
    aliases: ["creator_plus", "pro", "one_time", "trial"],
  },
  {
    id: "agency",
    name: "Agency",
    audience: "agency",
    description: "For agencies: client workspaces, white-label, client reports and the AI Growth Agent for every client.",
    monthlyUsd: 44.99,
    yearlyUsd: 449.9,
    trialDays: TRIAL_DAYS,
    limits: {
      workspaces: 5,
      channels: 25,
      contacts: 50000,
      aiReplies: 20000,
      broadcasts: -1,
      seats: 10,
      whiteLabel: true,
      apiAccess: true,
      aiAgent: true,
      insights: "daily",
    },
    aliases: ["agency"],
  },
  {
    id: "agency_pro",
    name: "Unlimited",
    audience: "agency",
    description: "Internal tier for platform admins. Not sold.",
    monthlyUsd: 349,
    yearlyUsd: 3490,
    trialDays: 0,
    limits: {
      workspaces: 50,
      channels: -1,
      contacts: -1,
      aiReplies: 200000,
      broadcasts: 200,
      seats: 30,
      whiteLabel: true,
      apiAccess: true,
      aiAgent: true,
      insights: "daily",
    },
    aliases: ["agency_pro"],
    hidden: true,
  },
]

const BY_ID = new Map(PLAN_CATALOG.map((plan) => [plan.id, plan]))
const BY_ALIAS = new Map<string, PlanDefinition>()
for (const plan of PLAN_CATALOG) {
  for (const alias of plan.aliases) BY_ALIAS.set(alias, plan)
}

export interface ResolvedPlan extends PlanDefinition {
  /** Expired subscriptions cannot create new usage. The free tier can. */
  blocked: boolean
}

export function resolvePlan(slug: string | null | undefined): ResolvedPlan {
  if (!slug || slug === "expired") {
    const free = BY_ID.get("creator_free")!
    return { ...free, id: slug === "expired" ? "expired" : free.id, blocked: slug === "expired" }
  }
  const match = BY_ALIAS.get(slug) || BY_ID.get(slug) || BY_ID.get("creator_free")!
  return { ...match, blocked: false }
}

export function limitFor(plan: ResolvedPlan, key: MeterKey): number {
  return plan.limits[key]
}

export function featureEnabled(plan: ResolvedPlan, key: FeatureKey): boolean {
  if (plan.blocked) return false
  return plan.limits[key]
}

export function planPriceCents(planId: string, interval: "month" | "year"): number {
  const plan = resolvePlan(planId)
  const usd = interval === "year" ? plan.yearlyUsd : plan.monthlyUsd
  return Math.round(usd * 100)
}

export function isMonthlyMeter(key: MeterKey): boolean {
  return key === "aiReplies" || key === "broadcasts"
}

export function meterPeriod(key: MeterKey, now: Date): string {
  if (!isMonthlyMeter(key)) return "lifetime"
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

// ---- Admin-controlled entitlements -----------------------------------------

const NUMERIC_LIMITS: Array<keyof PlanLimits> = ["workspaces", "channels", "contacts", "aiReplies", "broadcasts", "seats"]
const BOOLEAN_LIMITS: Array<keyof PlanLimits> = ["whiteLabel", "apiAccess", "aiAgent"]
const INSIGHT_LEVELS: InsightsLevel[] = ["none", "weekly", "daily"]

/**
 * Cleans what the admin form sends for plans.entitlements: only known keys,
 * integers from -1 (unlimited) to 1,000,000,000, real booleans, a valid
 * insights level. Anything else is dropped, never trusted.
 */
export function sanitizeEntitlements(input: unknown): Partial<PlanLimits> {
  const out: Record<string, number | boolean | string> = {}
  if (!input || typeof input !== "object") return out
  const source = input as Record<string, unknown>
  for (const key of NUMERIC_LIMITS) {
    const value = source[key]
    if (typeof value === "number" && Number.isInteger(value) && value >= -1 && value <= 1_000_000_000) out[key] = value
  }
  for (const key of BOOLEAN_LIMITS) {
    if (typeof source[key] === "boolean") out[key] = source[key] as boolean
  }
  if (typeof source.insights === "string" && (INSIGHT_LEVELS as string[]).includes(source.insights)) out.insights = source.insights
  return out as Partial<PlanLimits>
}

/** The catalog defaults with the admin's overrides on top. */
export function applyEntitlements<T extends PlanDefinition>(plan: T, overrides: unknown): T {
  const clean = sanitizeEntitlements(overrides)
  if (Object.keys(clean).length === 0) return plan
  return { ...plan, limits: { ...plan.limits, ...clean } }
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n)
const count = (n: number, one: string, many: string) => (n < 0 ? `Unlimited ${many}` : `${fmt(n)} ${n === 1 ? one : many}`)

/**
 * Human feature lines generated from a plan's real limits, so what customers
 * read on the pricing page can never drift from what the server enforces.
 */
export function describeEntitlements(limits: PlanLimits): string[] {
  const lines = [
    count(limits.channels, "channel", "channels"),
    count(limits.contacts, "contact", "contacts"),
    `${limits.aiReplies < 0 ? "Unlimited" : fmt(limits.aiReplies)} AI replies / month`,
    limits.broadcasts === 0 ? null : `${limits.broadcasts < 0 ? "Unlimited" : fmt(limits.broadcasts)} broadcasts / month`,
    limits.workspaces > 1 || limits.workspaces < 0 ? count(limits.workspaces, "client workspace", "client workspaces") : null,
    limits.seats > 1 || limits.seats < 0 ? count(limits.seats, "team seat", "team seats") : null,
    limits.insights === "daily" ? "Daily AI recommendations" : limits.insights === "weekly" ? "Weekly AI recommendations" : null,
    limits.aiAgent ? "AI Growth Agent" : null,
    limits.apiAccess ? "Public API" : null,
    limits.whiteLabel ? "White-label and client reports" : null,
  ]
  return lines.filter((line): line is string => Boolean(line))
}
