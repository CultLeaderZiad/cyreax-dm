/**
 * TikTok Business Messaging is approval-gated.
 * Access guide: doc 1832184145137922.
 * Send guide: doc 1832184403754242.
 *
 * `TIKTOK_MESSAGING_ENABLED` stays off until the developer app, the Accounts
 * API access form, and the Business Messaging review are approved. Apply
 * without the US when the business is in MENA or the GCC so that review is
 * faster. Set `TIKTOK_US_REVIEW_APPROVED=true` only after the separate US
 * data security review.
 */

export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"

/**
 * Scopes requested on the TikTok account-holder authorize URL.
 * `message.list.read` receives DMs, `message.list.send` replies,
 * `message.list.manage` covers read state. The profile scopes identify the
 * Business Account. `comment.list` is required for the comment.update webhook.
 * Do not add video.publish; this app does not post videos.
 */
export const TIKTOK_OAUTH_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.profile",
  "user.account.type",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
  "comment.list",
  "comment.list.manage",
] as const

export function tiktokMessagingEnabled(): boolean {
  return process.env.TIKTOK_MESSAGING_ENABLED === "true"
}

/** Separate from the global messaging flag. Accepts either env name. */
export function tiktokUsReviewApproved(): boolean {
  return process.env.TIKTOK_US_REVIEW_APPROVED === "true" || process.env.US_REVIEW_APPROVED === "true"
}

/**
 * Comment-to-Message is a separate product switch inside Business Messaging.
 * Official limit: the Business Account must be registered in Vietnam,
 * Indonesia, or Thailand, and the commenter must be in APAC, LATAM, or METAP.
 * A keyword rule cannot DM an arbitrary comment.
 */
export function tiktokCommentToDmEnabled(): boolean {
  return tiktokMessagingEnabled() && process.env.TIKTOK_COMMENT_TO_DM_ENABLED === "true"
}

export function tiktokAppId(): string {
  return process.env.TIKTOK_APP_ID || ""
}

export function tiktokAppSecret(): string {
  return process.env.TIKTOK_APP_SECRET || ""
}

export function tiktokRedirectUri(): string {
  const explicit = process.env.TIKTOK_REDIRECT_URI
  if (explicit) return explicit
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  return origin ? `${origin}/api/tiktok/callback` : ""
}
