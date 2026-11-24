/**
 * Keeps the prices shown in the app equal to the prices on Whop. Whop is the
 * source of truth for what a customer is charged, so a price edited there
 * shows up here without anyone touching the app.
 *
 * Only USD prices are copied (EGP prices stay admin-set). A failed or odd
 * answer from Whop never changes anything.
 */
import { getWhopPlan, isWhopVariantId, whopConfig, type WhopPlanInfo } from "@/lib/billing/whop"

export const SYNC_TTL_MS = 10 * 60 * 1000
const MAX_PRICE = 100_000

export interface PriceSyncResult {
  checked: number
  updated: Array<{ plan: string; field: "price_usd" | "price_yearly"; from: number | null; to: number }>
  errors: number
}

type Fetcher = (id: string, apiKey: string) => Promise<WhopPlanInfo>

export function usablePrice(info: WhopPlanInfo): number | null {
  if (info.currency !== "USD" || info.price == null) return null
  if (!Number.isFinite(info.price) || info.price <= 0 || info.price > MAX_PRICE) return null
  return Math.round(info.price * 100) / 100
}

export async function syncWhopPrices(
  supabase: any,
  opts: { force?: boolean; now?: number; apiKey?: string; fetchPlan?: Fetcher } = {},
): Promise<PriceSyncResult> {
  const result: PriceSyncResult = { checked: 0, updated: [], errors: 0 }
  const apiKey = opts.apiKey ?? whopConfig()?.apiKey
  if (!apiKey) return result
  const now = opts.now ?? Date.now()
  const fetchPlan = opts.fetchPlan ?? ((id, key) => getWhopPlan(id, key))

  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, name, price_usd, price_yearly, whop_variant_id, whop_variant_id_yearly, whop_synced_at")
  if (error || !plans) return result

  for (const plan of plans) {
    const hasMonthly = isWhopVariantId(plan.whop_variant_id)
    const hasYearly = isWhopVariantId(plan.whop_variant_id_yearly)
    if (!hasMonthly && !hasYearly) continue
    const syncedAt = plan.whop_synced_at ? Date.parse(plan.whop_synced_at) : 0
    if (!opts.force && now - syncedAt < SYNC_TTL_MS) continue

    const patch: Record<string, unknown> = {}
    let failed = false
    for (const [id, field, current] of [
      [hasMonthly ? plan.whop_variant_id : null, "price_usd", plan.price_usd],
      [hasYearly ? plan.whop_variant_id_yearly : null, "price_yearly", plan.price_yearly],
    ] as const) {
      if (!id) continue
      result.checked++
      try {
        const price = usablePrice(await fetchPlan(id, apiKey))
        if (price == null) { failed = true; continue }
        if (current == null || Math.abs(Number(current) - price) > 0.001) {
          patch[field] = price
          result.updated.push({ plan: plan.name, field, from: current == null ? null : Number(current), to: price })
        }
      } catch {
        failed = true
        result.errors++
      }
    }
    // A plan whose Whop read failed is retried on the next call instead of waiting a full TTL.
    if (!failed) patch.whop_synced_at = new Date(now).toISOString()
    if (Object.keys(patch).length) await supabase.from("plans").update(patch).eq("id", plan.id)
  }
  return result
}

let inFlight: Promise<unknown> | null = null
let lastAttempt = 0

/**
 * Called on the public plan reads. At most one sync per instance runs at a
 * time, none more often than every minute, and the caller waits at most
 * `waitMs` for it, so Whop being slow never slows the pricing page down.
 */
export async function syncWhopPricesIfStale(supabase: any, waitMs = 2500): Promise<void> {
  const now = Date.now()
  if (!inFlight && now - lastAttempt >= 60_000) {
    lastAttempt = now
    inFlight = syncWhopPrices(supabase).catch(() => null).finally(() => { inFlight = null })
  }
  if (inFlight) await Promise.race([inFlight, new Promise((resolve) => setTimeout(resolve, waitMs))])
}
