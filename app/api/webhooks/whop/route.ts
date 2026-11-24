export const dynamic = "force-dynamic"
export const maxDuration = 30

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { verifyWhopWebhook, whopConfig, WhopSignatureError } from "@/lib/billing/whop"
import { applyWhopEvent, whopApi } from "@/lib/billing/whop-sync"
import { captureException } from "@/lib/monitoring"

/**
 * POST /api/webhooks/whop
 *
 * Configure in Whop -> Developer -> Webhooks with the events listed in
 * docs/DEPLOY.md. Every delivery is signature-checked (Standard Webhooks, the
 * ws_ secret in WHOP_WEBHOOK_SECRET) and processed once per webhook-id.
 * A 5xx makes Whop retry; anything we deliberately ignore returns 200.
 */
export async function POST(request: NextRequest) {
  const config = whopConfig()
  if (!config) return NextResponse.json({ error: "Whop is not configured" }, { status: 503 })

  const raw = await request.text()
  let event: ReturnType<typeof verifyWhopWebhook>
  try {
    event = verifyWhopWebhook(raw, request.headers, config.webhookSecret)
  } catch (error) {
    if (error instanceof WhopSignatureError) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    throw error
  }

  const webhookId = request.headers.get("webhook-id")!
  const supabase = await getSupabaseBypassClient()

  // Idempotency: the same webhook-id is delivered again on retries.
  const { data: seen } = await supabase.from("whop_webhook_events").select("webhook_id, processed_at").eq("webhook_id", webhookId).maybeSingle()
  if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true })
  if (!seen) {
    const { error } = await supabase.from("whop_webhook_events").insert({ webhook_id: webhookId, type: event.type })
    // A concurrent delivery of the same id won the insert: let that one finish.
    if (error) return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    const outcome = await applyWhopEvent(supabase, event, whopApi(config.apiKey))
    const result = outcome.result === "applied" ? `applied:${outcome.status}` : `ignored:${outcome.reason}`
    if (outcome.result === "ignored" && !/not used|no membership/.test(outcome.reason)) {
      console.warn(`[whop-webhook] ${event.type} ignored: ${outcome.reason}`)
    }
    await supabase
      .from("whop_webhook_events")
      .update({ processed_at: new Date().toISOString(), result: result.slice(0, 200) })
      .eq("webhook_id", webhookId)
    return NextResponse.json({ received: true })
  } catch (error) {
    // Not marked processed, so Whop's retry runs it again.
    void captureException(error, { route: "webhooks/whop", type: event.type })
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
