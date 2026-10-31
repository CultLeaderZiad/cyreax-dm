import { after } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import {
  splitInboundEvents,
  type InboundPiece,
  type InboundPlatform,
} from "@/lib/event-pipeline"

/**
 * Persist webhook pieces before any reply is sent.
 * A unique violation is a duplicate delivery and is not an error.
 */
export async function enqueueInboundEvents(
  supabase: any,
  pieces: InboundPiece[],
): Promise<{ accepted: number; duplicates: number }> {
  let accepted = 0
  let duplicates = 0
  for (const piece of pieces) {
    const { error } = await supabase.from("inbound_events").insert({
      platform: piece.platform,
      idempotency_key: piece.idempotencyKey,
      account_key: piece.accountKey,
      payload: piece.payload,
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    })
    if (!error) {
      accepted += 1
      continue
    }
    if (error.code === "23505") {
      duplicates += 1
      continue
    }
    throw error
  }
  return { accepted, duplicates }
}

export function scheduleInboundDrain() {
  after(async () => {
    try {
      const { drainInboundEvents } = await import("@/lib/inbound-worker")
      const supabase = await getSupabaseBypassClient()
      await drainInboundEvents(supabase)
    } catch (error) {
      console.error("[inbound] background drain failed:", error)
    }
  })
}

function queueIsMissing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /inbound_events/i.test(message)
}

/**
 * Returns `fallback: true` when `inbound_events` is not installed yet.
 * Callers then run the processor in the request, which is the pre-queue
 * behavior, so a deploy is not stuck returning 500 until the SQL is applied.
 */
export async function acceptInboundWebhook(
  supabase: any,
  platform: InboundPlatform,
  body: unknown,
  options?: { botId?: string },
): Promise<{ accepted: number; duplicates: number; fallback: boolean }> {
  const pieces = splitInboundEvents(platform, body, options)
  if (pieces.length === 0) return { accepted: 0, duplicates: 0, fallback: false }
  try {
    const result = await enqueueInboundEvents(supabase, pieces)
    if (result.accepted > 0 || result.duplicates > 0) scheduleInboundDrain()
    return { ...result, fallback: false }
  } catch (error: any) {
    if (queueIsMissing(error)) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
        console.error("[inbound] FATAL: inbound_events table is missing in production! Apply migration 20261028_inbound_queue.sql.")
        throw new Error("Queue infrastructure not provisioned: inbound_events table missing in production.")
      }
      console.warn("[inbound] inbound_events is not installed; processing this delivery in the request")
      return { accepted: 0, duplicates: 0, fallback: true }
    }
    throw error
  }
}
