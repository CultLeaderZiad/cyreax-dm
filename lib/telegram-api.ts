/**
 * Telegram Bot API helper functions.
 * Full integration supporting text, photos, cards, inline keyboards,
 * chat actions (typing), delays, and callback query handling.
 */

const TG_API = "https://api.telegram.org"

export interface TgSendResult {
  ok: boolean
  messageId?: number
  error?: string
}

export interface TgBotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username: string
}

export interface TgButton {
  type?: "web_url" | "postback"
  title: string
  url?: string
  payload?: string
}

export interface TgCard {
  title: string
  subtitle?: string
  image_url?: string
  buttons?: TgButton[]
}

export interface TgQuickReply {
  title: string
  payload?: string
}

export async function getBotInfo(botToken: string): Promise<{ ok: boolean; bot?: TgBotInfo; error?: string }> {
  try {
    const res = await fetch(`${TG_API}/bot${botToken}/getMe`)
    const data = await res.json()
    if (data.ok && data.result) {
      return { ok: true, bot: data.result as TgBotInfo }
    }
    console.error("[tg-api] getMe failed:", data)
    return { ok: false, error: data.description || JSON.stringify(data) }
  } catch (e: any) {
    console.error("[tg-api] getMe network error:", e)
    return { ok: false, error: e.message || String(e) }
  }
}

export async function setWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // POST body, not query string: keeps the secret out of any intermediary URL logs.
    const res = await fetch(`${TG_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secretToken ? { secret_token: secretToken } : {}),
      }),
    })
    const data = await res.json()
    if (data.ok) {
      console.log("[tg-api] Webhook set successfully")
      return { ok: true }
    }
    console.error("[tg-api] setWebhook failed:", data?.description || "unknown error")
    return { ok: false, error: data.description || "setWebhook failed" }
  } catch (e: any) {
    console.error("[tg-api] setWebhook network error:", e?.message || String(e))
    return { ok: false, error: e.message || String(e) }
  }
}

export async function deleteWebhook(botToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API}/bot${botToken}/deleteWebhook`)
    const data = await res.json()
    return data.ok === true
  } catch (e) {
    console.error("[tg-api] deleteWebhook error:", e)
    return false
  }
}

export async function sendTelegramChatAction(
  botToken: string,
  chatId: string | number,
  action: "typing" | "upload_photo" | "record_video" | "upload_video" = "typing",
): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API}/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    })
    const data = await res.json()
    return data.ok === true
  } catch (e) {
    console.warn("[tg-api] request failed:", e)
    return false
  }
}

export async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<boolean> {
  try {
    const body: any = { callback_query_id: callbackQueryId }
    if (text) body.text = text
    const res = await fetch(`${TG_API}/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data.ok === true
  } catch (e) {
    console.warn("[tg-api] request failed:", e)
    return false
  }
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2"
    replyMarkup?: any
  },
): Promise<TgSendResult> {
  try {
    const body: any = {
      chat_id: chatId,
      text,
    }
    if (options?.parseMode) body.parse_mode = options.parseMode
    if (options?.replyMarkup) body.reply_markup = options.replyMarkup

    const res = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    if (data.ok) {
      return { ok: true, messageId: data.result?.message_id }
    }
    console.error(`[tg-api] sendMessage failed:`, data)
    return { ok: false, error: data.description || "Unknown error" }
  } catch (e) {
    console.error(`[tg-api] sendMessage network error:`, e)
    return { ok: false, error: String(e) }
  }
}

export async function sendTelegramPhoto(
  botToken: string,
  chatId: string | number,
  photoUrl: string,
  options?: {
    caption?: string
    parseMode?: "HTML" | "Markdown" | "MarkdownV2"
    replyMarkup?: any
  },
): Promise<TgSendResult> {
  try {
    const body: any = {
      chat_id: chatId,
      photo: photoUrl,
    }
    if (options?.caption) body.caption = options.caption
    if (options?.parseMode) body.parse_mode = options.parseMode
    if (options?.replyMarkup) body.reply_markup = options.replyMarkup

    const res = await fetch(`${TG_API}/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    if (data.ok) {
      return { ok: true, messageId: data.result?.message_id }
    }
    console.error(`[tg-api] sendPhoto failed:`, data)
    return { ok: false, error: data.description || "Unknown error" }
  } catch (e) {
    console.error(`[tg-api] sendPhoto network error:`, e)
    return { ok: false, error: String(e) }
  }
}

export function buildTelegramInlineKeyboard(buttons: TgButton[] | TgQuickReply[]) {
  if (!buttons || buttons.length === 0) return undefined
  const rows = buttons.map((b: any) => {
    if (b.type === "web_url" && b.url) {
      return [{ text: b.title, url: b.url }]
    }
    const payload = b.payload || b.url || b.title
    return [{ text: b.title, callback_data: payload }]
  })
  return { inline_keyboard: rows }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.min(ms, 8000)))
}

/**
 * High-level unified response sender for Telegram.
 * Handles delay, typing indicator, text, cards, media, and quick replies.
 */
export async function sendTelegramAutomationResponse(
  botToken: string,
  chatId: string | number,
  content: any,
  opts: { skipTyping?: boolean; automationId?: string; variantId?: string | null } = {},
): Promise<TgSendResult> {
  const useTyping = content.typing_indicator === true && !opts.skipTyping

  if (useTyping) await sendTelegramChatAction(botToken, chatId, "typing")

  let result: TgSendResult

  // Card response
  if (content.card) {
    const card = content.card as TgCard
    const keyboard = buildTelegramInlineKeyboard(card.buttons || [])
    const caption = `*${card.title}*${card.subtitle ? `\n\n${card.subtitle}` : ""}`

    if (card.image_url?.startsWith("http")) {
      result = await sendTelegramPhoto(botToken, chatId, card.image_url, {
        caption,
        parseMode: "Markdown",
        replyMarkup: keyboard,
      })
    } else {
      result = await sendTelegramMessage(botToken, chatId, caption, {
        parseMode: "Markdown",
        replyMarkup: keyboard,
      })
    }
  }
  // Media response
  else if (content.media?.url) {
    const keyboard = buildTelegramInlineKeyboard(content.quick_replies || [])
    result = await sendTelegramPhoto(botToken, chatId, content.media.url, {
      caption: content.message || undefined,
      replyMarkup: keyboard,
    })
  }
  // Plain text response (with optional quick replies / buttons)
  else if (content.message || typeof content === "string") {
    const messageText = typeof content === "string" ? content : content.message
    const keyboard = buildTelegramInlineKeyboard(content.quick_replies || [])
    result = await sendTelegramMessage(botToken, chatId, messageText, {
      replyMarkup: keyboard,
    })
  } else {
    result = { ok: false, error: "Empty automation content" }
  }

  return result
}
