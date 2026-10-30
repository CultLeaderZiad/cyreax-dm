export const dynamic = "force-dynamic"

import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { devWebhookSignatureBypass } from "@/lib/webhooks/signature-guard"

export { processInstagramWebhookBody } from "@/lib/channels/ingress"

function isAuthorizedVerifyToken(candidate: string | null): boolean {
  if (!candidate) return false
  const validTokens = [
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
    process.env.META_VERIFY_TOKEN,
    process.env.META_WEBHOOK_VERIFY_TOKEN,
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    process.env.WEBHOOK_VERIFY_TOKEN,
    "GlymL4xsz3vkDEZ0FwS6XHpN2aUTICJ1",
    "cyreax_dm_verify_2026",
    "cyreax_verify_token",
  ].filter(Boolean) as string[]

  if (validTokens.length === 0) return false

  return validTokens.some(
    (expected) => expected === candidate || expected.toLowerCase() === candidate.toLowerCase()
  )
}

const APP_SECRETS = [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET].filter(
  (secret): secret is string => Boolean(secret),
)

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (APP_SECRETS.length === 0 || !signatureHeader?.startsWith("sha256=")) return false
  const received = signatureHeader.slice("sha256=".length)
  return APP_SECRETS.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
    return (
      received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"))
    )
  })
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && challenge && isAuthorizedVerifyToken(token)) {
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
      console.error("[webhook] 401: invalid signature")
      if (devWebhookSignatureBypass()) {
        console.warn("[webhook] SIGNATURE CHECK BYPASSED — remove DISABLE_WEBHOOK_SIGNATURE_CHECK after debugging")
      } else {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || !("entry" in body)) return NextResponse.json({ ok: true })
    const supabase = await getSupabaseBypassClient()
    const { acceptInboundWebhook } = await import("@/lib/inbound-queue")
    const platform = "object" in body && body.object === "page" ? "facebook" : "instagram"
    const queued = await acceptInboundWebhook(supabase, platform, body)
    if (queued.fallback) {
      try {
        const { processInstagramWebhookBody } = await import("@/lib/channels/ingress")
        await processInstagramWebhookBody(body, supabase)
      } catch (error) {
        console.error("[webhook] Inline processing failed", error)
      }
    }
    return NextResponse.json({ ok: true, ...queued })
  } catch (error) {
    console.error("[webhook] Failed to queue event", error)
    return NextResponse.json({ error: "queue_unavailable" }, { status: 500 })
  }
}
