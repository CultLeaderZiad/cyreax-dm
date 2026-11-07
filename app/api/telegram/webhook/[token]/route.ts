export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { openAccessToken } from "@/lib/token-crypto"
import {
  TELEGRAM_SECRET_HEADER,
  parseTelegramPathSegment,
  telegramSecretMatches,
  telegramWebhookSecret,
  telegramWebhookUrl,
} from "@/lib/telegram-webhook"

export { processTelegramUpdate } from "@/lib/channels/ingress"

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params
  // Current form: /api/telegram/webhook/<botId> + secret header.
  // Legacy form: /api/telegram/webhook/<botToken> (only until the bot is migrated).
  const parsed = parseTelegramPathSegment(resolvedParams.token)
  if (!parsed) {
    return NextResponse.json({ error: "Invalid webhook path" }, { status: 400 })
  }
  const { botId, legacyToken } = parsed

  try {
    const supabase = await getSupabaseBypassClient()
    const { data: byPage, error: pageError } = await supabase
      .from("platform_connections")
      .select("*")
      .eq("platform", "telegram")
      .eq("page_id", botId)
      .limit(1)
    let connection = byPage?.[0]
    let connError = pageError
    if (!connection && !connError) {
      const byExternal = await supabase
        .from("platform_connections")
        .select("*")
        .eq("platform", "telegram")
        .eq("external_account_id", botId)
        .limit(1)
      connection = byExternal.data?.[0]
      connError = byExternal.error
    }

    if (connError || !connection) {
      console.warn(`[Telegram Webhook] Unknown bot ID: ${botId}`)
      return NextResponse.json({ error: "Unknown bot" }, { status: 404 })
    }

    const storedToken = openAccessToken(connection.access_token)
    if (!storedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (legacyToken) {
      // Old registration. Accept only while the bot has not been moved to the
      // secret-header form, then move it so the token stops landing in logs.
      if (connection.metadata?.webhook_secret_v2 || storedToken !== legacyToken) {
        console.warn("[Telegram Webhook] Rejected legacy-path delivery")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      await migrateLegacyWebhook(supabase, connection, storedToken, request)
    } else if (!telegramSecretMatches(storedToken, request.headers.get(TELEGRAM_SECRET_HEADER))) {
      console.warn("[Telegram Webhook] Secret mismatch")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let update: unknown
    try {
      update = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const { acceptInboundWebhook } = await import("@/lib/inbound-queue")
    const queued = await acceptInboundWebhook(supabase, "telegram", update, { botId })
    if (queued.fallback) {
      try {
        const { processTelegramUpdate } = await import("@/lib/channels/ingress")
        await processTelegramUpdate(supabase, botId, update)
      } catch (error) {
        console.error("[Telegram Webhook] Inline processing failed", error)
      }
    }
    return NextResponse.json({ ok: true, ...queued })
  } catch (error) {
    console.error("[Telegram Webhook] Failed to queue event", error)
    return NextResponse.json({ error: "queue_unavailable" }, { status: 500 })
  }
}

/** Best effort: re-register the bot at the bot-id URL with a secret_token. */
async function migrateLegacyWebhook(supabase: any, connection: any, botToken: string, request: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    if (!appUrl.startsWith("https://")) return
    const { setWebhook } = await import("@/lib/telegram-api")
    const result = await setWebhook(botToken, telegramWebhookUrl(appUrl, String(connection.page_id || connection.external_account_id)), telegramWebhookSecret(botToken))
    if (!result.ok) return
    await supabase
      .from("platform_connections")
      .update({ metadata: { ...(connection.metadata || {}), webhook_secret_v2: true, webhook_subscribed: true } })
      .eq("id", connection.id)
  } catch (error: any) {
    console.warn("[Telegram Webhook] Legacy migration failed:", error?.message || String(error))
  }
}
