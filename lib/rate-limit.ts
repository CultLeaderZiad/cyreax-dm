/**
 * Fixed-window limits backed by Postgres (`take_inbound_rate_slot`, phase 2
 * migration). Shared by every serverless instance, unlike an in-memory map.
 *
 * Keys are namespaced (`abuse:<action>:<scope>:<id>`) so they never collide
 * with the inbound queue's per-account buckets in the same table.
 */
export interface RateRule {
  key: string
  limit: number
  windowSeconds: number
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>

/**
 * Takes one slot from every rule. Returns false as soon as one is full.
 * `failOpen` decides what a database error means: false (default) refuses,
 * which is right for anything that costs money or sends mail.
 */
export async function takeRateSlots(
  supabase: { rpc: Rpc },
  rules: RateRule[],
  options: { failOpen?: boolean } = {},
): Promise<boolean> {
  for (const rule of rules) {
    const { data, error } = await supabase.rpc("take_inbound_rate_slot", {
      p_account_key: rule.key.slice(0, 200),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (error || typeof data !== "boolean") {
      console.warn("[rate-limit] slot check failed:", rule.key.split(":").slice(0, 2).join(":"), error?.message)
      if (!options.failOpen) return false
      continue
    }
    if (!data) return false
  }
  return true
}

/** Per-identity burst plus a global ceiling on managed LLM calls. Override with env. */
export function llmRateRules(userId: string, accountId: string, env: Record<string, string | undefined> = process.env): RateRule[] {
  const perMinute = Math.max(1, Number(env.LLM_PER_ACCOUNT_PER_MINUTE) || 30)
  const globalPerMinute = Math.max(1, Number(env.LLM_GLOBAL_PER_MINUTE) || 600)
  return [
    { key: `abuse:llm:account:${accountId || userId}`, limit: perMinute, windowSeconds: 60 },
    { key: "abuse:llm:global", limit: globalPerMinute, windowSeconds: 60 },
  ]
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"
  return headers.get("x-real-ip") || "unknown"
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
