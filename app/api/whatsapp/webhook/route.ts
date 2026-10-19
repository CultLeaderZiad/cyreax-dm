export const dynamic = "force-dynamic"

import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { devWebhookSignatureBypass, whatsappVerifyTokenMatches } from "@/lib/whatsapp/webhook-guard"

export { processWhatsAppWebhookBody } from "@/lib/channels/ingress"

const APP_SECRET = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET || !signatureHeader?.startsWith("sha256=")) return false
  const received = signatureHeader.slice("sha256=".length)
  const expected = crypto.createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex")
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"))
  )
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && challenge && whatsappVerifyTokenMatches(token, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return new NextResponse(JSON.stringify({ error: "Invalid token" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-hub-signature-256")
    if (!isValidSignature(rawBody, signature)) {
      // Dev-only bypass; NODE_ENV or VERCEL_ENV production always requires a valid HMAC.
      if (!devWebhookSignatureBypass()) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || !("object" in body) || body.object !== "whatsapp_business_account") {
      return NextResponse.json({ ok: true })
    }

    const supabase = await getSupabaseBypassClient()
    const { acceptInboundWebhook } = await import("@/lib/inbound-queue")
    const queued = await acceptInboundWebhook(supabase, "whatsapp", body)
    if (queued.fallback) {
      try {
        const { processWhatsAppWebhookBody } = await import("@/lib/channels/ingress")
        await processWhatsAppWebhookBody(body, supabase)
      } catch (error) {
        console.error("[wa-webhook] Inline processing failed", error)
      }
    }
    return NextResponse.json({ ok: true, ...queued })
  } catch (error) {
    console.error("[wa-webhook] Failed to queue event", error)
    return NextResponse.json({ error: "queue_unavailable" }, { status: 500 })
  }
}
