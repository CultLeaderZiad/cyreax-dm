import { captureException } from "@/lib/monitoring"
import {
  failurePlan,
  inboundRateLimit,
  inboundRateWindowMs,
  takeRateToken,
  DEFAULT_MAX_ATTEMPTS,
  type InboundPlatform,
} from "@/lib/event-pipeline"

const BATCH_SIZE = 10
const MAX_BATCHES = 5
const LOCK_SECONDS = 120

export interface DrainSummary {
  claimed: number
  done: number
  retried: number
  dead: number
  deferred: number
  errors: string[]
}

/**
 * Drains `inbound_events`. Safe to run from the webhook's `after()` hook and
 * from the cron route. Claim is `FOR UPDATE SKIP LOCKED` inside
 * `claim_inbound_events`, so overlapping drains do not double-send.
 */
export async function drainInboundEvents(supabase: any): Promise<DrainSummary> {
  const summary: DrainSummary = { claimed: 0, done: 0, retried: 0, dead: 0, deferred: 0, errors: [] }

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await claimBatch(supabase)
    if (rows.length === 0) break
    summary.claimed += rows.length

    for (const row of rows) {
      const accountKey = row.account_key || `${row.platform}:unknown`
      const allowed = await reserveRateSlot(supabase, accountKey)
      if (!allowed) {
        await supabase
          .from("inbound_events")
          .update({
            status: "pending",
            locked_at: null,
            next_attempt_at: new Date(Date.now() + inboundRateWindowMs()).toISOString(),
          })
          .eq("id", row.id)
        summary.deferred += 1
        continue
      }

      try {
        await dispatchInboundEvent(supabase, row)
        const { error } = await supabase
          .from("inbound_events")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
            locked_at: null,
            last_error: null,
          })
          .eq("id", row.id)
        if (error) throw error
        summary.done += 1
      } catch (error: any) {
        const message = error?.message || String(error)
        const attempts = Number(row.attempts || 0) + 1
        const plan = failurePlan(attempts, Date.now(), DEFAULT_MAX_ATTEMPTS)
        await supabase
          .from("inbound_events")
          .update({
            status: plan.status,
            attempts,
            next_attempt_at: new Date(plan.nextAttemptAt).toISOString(),
            locked_at: null,
            last_error: message.slice(0, 500),
          })
          .eq("id", row.id)
        if (plan.status === "dead") {
          summary.dead += 1
          // A message we gave up on is a customer who never got a reply: alert.
          void captureException(error, { area: "inbound-worker", outcome: "dead", platform: String(row.platform || "") })
        } else summary.retried += 1
        summary.errors.push(message)
      }
    }
  }

  try {
    const { drainFlowJobs } = await import("@/lib/flows/runtime")
    await drainFlowJobs(supabase)
  } catch (error) {
    console.error("[inbound] flow drain failed:", error)
    void captureException(error, { area: "flow-drain" })
  }

  return summary
}

async function claimBatch(supabase: any): Promise<any[]> {
  const { data, error } = await supabase.rpc("claim_inbound_events", {
    batch_size: BATCH_SIZE,
    lock_seconds: LOCK_SECONDS,
  })
  if (error) throw error
  return data || []
}

async function reserveRateSlot(supabase: any, accountKey: string): Promise<boolean> {
  const limit = inboundRateLimit()
  const windowMs = inboundRateWindowMs()
  const { data, error } = await supabase.rpc("take_inbound_rate_slot", {
    p_account_key: accountKey,
    p_limit: limit,
    p_window_seconds: Math.ceil(windowMs / 1000),
  })
  if (!error && typeof data === "boolean") return data

  // The SQL function is part of the phase 2 migration. Until it exists, apply
  // the same window in the worker so a missing function does not send unbounded.
  if (error && !/take_inbound_rate_slot|schema cache|does not exist/i.test(error.message || "")) {
    console.warn("[inbound] rate limit rpc failed, using table fallback:", error.message)
  }
  const { data: bucket, error: readError } = await supabase
    .from("inbound_rate_buckets")
    .select("window_start, count")
    .eq("account_key", accountKey)
    .maybeSingle()
  if (readError) {
    // Fail closed: defer the event rather than send without a limit.
    console.warn("[inbound] rate bucket read failed, deferring:", readError.message)
    return false
  }
  const current = bucket
    ? { windowStart: Date.parse(bucket.window_start), count: Number(bucket.count) || 0 }
    : null
  const decision = takeRateToken(current, Date.now(), limit, windowMs)
  if (!decision.allowed) return false
  await supabase.from("inbound_rate_buckets").upsert({
    account_key: accountKey,
    window_start: new Date(decision.bucket.windowStart).toISOString(),
    count: decision.bucket.count,
  })
  return true
}

async function dispatchInboundEvent(supabase: any, row: { platform: InboundPlatform | string; payload: any; account_key?: string | null }) {
  const platform = row.platform
  if (platform === "instagram") {
    const { processInstagramWebhookBody } = await import("@/app/api/instagram/webhook/route")
    await processInstagramWebhookBody(row.payload, supabase)
    return
  }
  if (platform === "facebook") {
    const { handleFacebookWebhook } = await import("@/lib/facebook-webhook")
    await handleFacebookWebhook(row.payload, supabase)
    return
  }
  if (platform === "whatsapp") {
    const { processWhatsAppWebhookBody } = await import("@/app/api/whatsapp/webhook/route")
    await processWhatsAppWebhookBody(row.payload, supabase)
    return
  }
  if (platform === "tiktok") {
    const { processTikTokWebhookBody } = await import("@/lib/channels/ingress")
    await processTikTokWebhookBody(row.payload, supabase)
    return
  }
  if (platform === "webchat") {
    const { processWebchatEvent } = await import("@/lib/channels/ingress")
    await processWebchatEvent(row.payload, supabase)
    return
  }
  if (platform === "telegram") {
    const botId = String(row.account_key || "").replace(/^telegram:/, "")
    const { processTelegramUpdate } = await import("@/app/api/telegram/webhook/[token]/route")
    await processTelegramUpdate(supabase, botId, row.payload)
    return
  }
  throw new Error(`Unknown inbound platform: ${platform}`)
}
