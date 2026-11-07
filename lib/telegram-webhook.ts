import { createHmac, timingSafeEqual } from "crypto"

/**
 * Telegram webhooks used to be registered at /api/telegram/webhook/<botToken>,
 * which put the bot's full credential in every access log. They are now
 * registered at /api/telegram/webhook/<botId> with Telegram's `secret_token`,
 * which Telegram echoes in the X-Telegram-Bot-Api-Secret-Token header.
 *
 * The secret is derived from the bot token (already stored encrypted), so no
 * new column or env var is needed, and reconnecting a bot with a new token
 * rotates it. Hex output fits Telegram's allowed charset (A-Z a-z 0-9 _ -).
 */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token"

export function telegramWebhookSecret(botToken: string): string {
  return createHmac("sha256", botToken).update("cyreax:telegram-webhook:v1").digest("hex")
}

export function telegramSecretMatches(botToken: string, header: string | null): boolean {
  if (!header) return false
  const expected = Buffer.from(telegramWebhookSecret(botToken))
  const given = Buffer.from(header)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Path segment is either a bot id (current) or a full token (legacy, contains ':'). */
export function parseTelegramPathSegment(segment: string): { botId: string; legacyToken: string | null } | null {
  const value = String(segment || "").trim()
  if (/^\d{3,20}$/.test(value)) return { botId: value, legacyToken: null }
  const legacy = value.match(/^(\d{3,20}):[A-Za-z0-9_-]{20,}$/)
  if (legacy) return { botId: legacy[1], legacyToken: value }
  return null
}

export function telegramWebhookUrl(appUrl: string, botId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook/${botId}`
}
