export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getBotInfo, setWebhook } from "@/lib/telegram-api"
import { telegramWebhookSecret, telegramWebhookUrl } from "@/lib/telegram-webhook"
import { sealAccessToken } from "@/lib/token-crypto"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { assertChannelConnect, limitPayload, PlanLimitError } from "@/lib/billing/enforce"

/**
 * POST /api/telegram/connect
 *
 * Connects a Telegram bot by validating its token, setting the webhook,
 * and securely saving the encrypted token in platform_connections.
 */
export async function POST(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const roleDenied = forbidBelow(result.user.workspace_role, "admin")
  if (roleDenied) return roleDenied
  const { user: account, igUser, workspace } = result

  let body: { botToken?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { botToken } = body
  if (!botToken || typeof botToken !== "string") {
    return NextResponse.json({ error: "Missing or invalid botToken" }, { status: 400 })
  }

  const supabase = await getSupabaseBypassClient()
  let profile = igUser?.id ? igUser : null
  if (!profile) {
    try {
      profile = await ensureTenantProfile(supabase, account, "telegram_managed", workspace?.id)
    } catch (error) {
      console.error("[Telegram Connect] Could not prepare profile:", error)
      return NextResponse.json({ error: "Could not prepare an account profile" }, { status: 500 })
    }
  }
  const userId = profile.id

  try {
    // 1. Validate the bot token with Telegram
    const botInfoResult = await getBotInfo(botToken)
    if (!botInfoResult.ok || !botInfoResult.bot) {
      return NextResponse.json({ error: `Invalid Telegram bot token: ${botInfoResult.error}` }, { status: 400 })
    }
    const botInfo = botInfoResult.bot
    try {
      await assertChannelConnect(supabase, account, { platform: "telegram", pageId: String(botInfo.id) })
    } catch (error) {
      if (error instanceof PlanLimitError) return NextResponse.json(limitPayload(error), { status: 402 })
      throw error
    }

    // 2. Set the webhook
    const originHeader = request.headers.get("x-forwarded-proto") === "https" && request.headers.get("x-forwarded-host")
      ? `https://${request.headers.get("x-forwarded-host")}`
      : ""
    const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || originHeader || "https://cyreax-dm.vercel.app"
    let validatedAppUrl = rawAppUrl.trim().replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, '')
    if (!validatedAppUrl.startsWith("http://") && !validatedAppUrl.startsWith("https://")) {
      validatedAppUrl = `https://${validatedAppUrl}`
    }
    
    // Deep fix: skip webhook if testing on localhost since Telegram blocks HTTP webhooks
    const isLocal = validatedAppUrl.includes("localhost") || validatedAppUrl.startsWith("http://")

    // Bot id in the path, secret in Telegram's secret_token header. The bot
    // token never appears in a URL (and so never in access logs).
    const webhookUrl = telegramWebhookUrl(validatedAppUrl, String(botInfo.id))
    
    let webhookSubscribed = false
    
    if (isLocal) {
      console.warn(`[Telegram Connect] Skipping webhook registration for local development: ${validatedAppUrl}`)
    } else {
      const webhookResult = await setWebhook(botToken, webhookUrl, telegramWebhookSecret(botToken))
      if (!webhookResult.ok) {
        return NextResponse.json({ error: `Failed to register webhook with Telegram: ${webhookResult.error}` }, { status: 502 })
      }
      webhookSubscribed = true
    }

    // 3. Encrypt the token for secure storage at rest
    const encryptedToken = sealAccessToken(botToken)

    // 4. Save to platform_connections
    const pageId = botInfo.id.toString()

    const telegramData: Record<string, unknown> = {
      user_id: userId,
      account_id: account.id,
      platform: "telegram",
      page_id: pageId, // Using the bot's user ID as page_id
      external_account_id: pageId,
      access_token: encryptedToken,
      metadata: {
        name: botInfo.first_name,
        username: botInfo.username,
        is_bot: botInfo.is_bot,
        webhook_subscribed: webhookSubscribed,
        webhook_secret_v2: webhookSubscribed,
      }
    }
    
    const { data: existingTg } = await supabase.from("platform_connections")
      .select("id").eq("platform", "telegram").eq("page_id", pageId).maybeSingle()
      
    const saveConnection = (row: Record<string, unknown>) =>
      existingTg
        ? supabase.from("platform_connections").update(row).eq("id", existingTg.id)
        : supabase.from("platform_connections").insert(row)

    let { error: upsertError } = await saveConnection(telegramData)
    if (upsertError && /account_id/i.test(upsertError.message || "")) {
      const { account_id: _ignored, ...withoutAccount } = telegramData
      const retry = await saveConnection(withoutAccount)
      upsertError = retry.error
    }

    if (upsertError) {
      console.error("[Telegram Connect] Failed to save connection:", upsertError)
      return NextResponse.json({ error: "Failed to save connection to database" }, { status: 500 })
    }

    console.log(`[Telegram Connect] Successfully connected bot @${botInfo.username} for user ${userId}`)

    return NextResponse.json({
      success: true,
      bot: {
        id: pageId,
        name: botInfo.first_name,
        username: botInfo.username
      }
    })
  } catch (error) {
    console.error("[Telegram Connect] Unexpected error:", error)
    return NextResponse.json({ error: "Something went wrong connecting to Telegram. Please try again." }, { status: 500 })
  }
}

