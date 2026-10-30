export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { acceptInboundWebhook } from "@/lib/inbound-queue"
import { processTikTokWebhookBody } from "@/lib/channels/ingress"
import { tiktokAppSecret, tiktokMessagingEnabled } from "@/lib/tiktok/config"
import { verifyTikTokSignature } from "@/lib/tiktok/signature"
import { devWebhookSignatureBypass } from "@/lib/webhooks/signature-guard"

/**
 * POST /api/tiktok/webhook
 * Verifies TikTok-Signature, then queues the body.
 * When messaging is disabled the handler returns 200 and stores nothing,
 * so TikTok does not retry and a disabled workspace does not fill the queue.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("tiktok-signature")
  if (!devWebhookSignatureBypass()) {
    if (!verifyTikTokSignature(rawBody, signature, tiktokAppSecret())) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }
  if (!tiktokMessagingEnabled()) {
    return NextResponse.json({ ok: true, ignored: "tiktok_messaging_disabled" })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const supabase = await getSupabaseBypassClient()
    const queued = await acceptInboundWebhook(supabase, "tiktok", body)
    if (queued.fallback) {
      try {
        await processTikTokWebhookBody(body, supabase)
      } catch (error) {
        console.error("[tiktok-webhook] Inline processing failed", error)
      }
    }
    return NextResponse.json({ ok: true, ...queued })
  } catch (error) {
    console.error("[tiktok-webhook] Failed to queue event", error)
    return NextResponse.json({ error: "queue_unavailable" }, { status: 500 })
  }
}
