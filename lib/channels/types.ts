/**
 * One outbound contract for every channel.
 *
 * Instagram, Messenger, WhatsApp, Telegram, TikTok, and the website widget
 * each implement `ChannelAdapter`. The matcher and the inbox do not import a
 * vendor client.
 */

export const CHANNELS = ["instagram", "messenger", "facebook", "whatsapp", "telegram", "tiktok", "webchat"] as const

export type Channel = (typeof CHANNELS)[number]

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value)
}

export interface QuickReply {
  title: string
  payload: string
}

export interface OutboundButton {
  type: "web_url" | "postback"
  title: string
  url?: string
  payload?: string
}

export interface OutboundCard {
  title: string
  subtitle?: string
  image_url?: string
  buttons?: OutboundButton[]
}

export interface OutboundMedia {
  type: "image" | "video" | "audio" | "document"
  url: string
}

export interface OutboundListRow {
  id: string
  title: string
  description?: string
}

/** WhatsApp interactive list. Other adapters send the body as text. */
export interface OutboundList {
  button: string
  body?: string
  sections: Array<{ title?: string; rows: OutboundListRow[] }>
}

export interface OutboundContent {
  message?: string
  reply_text?: string
  card?: OutboundCard
  /** Instagram and Messenger send these as one generic-template carousel. */
  cards?: OutboundCard[]
  media?: OutboundMedia
  quick_replies?: QuickReply[]
  list?: OutboundList
  typing_indicator?: boolean
  mark_seen?: boolean
  reply_mode?: "both" | "dm_only" | "public_only"
  public_replies?: string[]
  /** When set on a TikTok comment rule, also build the Instagram comment-to-DM for this keyword. */
  cross_post_instagram?: boolean
  include_replies?: boolean
  check_follow?: boolean
  lead_capture?: {
    require_email?: boolean
    require_phone?: boolean
    require_name?: boolean
  }
}

export interface SendContext {
  accessToken: string
  recipientId?: string
  commentId?: string
  /**
   * WhatsApp phone-number id, TikTok business open id, or website widget key.
   * Other adapters ignore it.
   */
  senderRef?: string
  messagingType?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG"
  tag?: "HUMAN_AGENT"
  /** TikTok public comment replies need the video id. */
  mediaId?: string | null
  /**
   * TikTok Business Account sign-up region.
   * Undefined skips the region check (callers that predate region gating).
   * Null means the region is unknown and DMs stay on the rest-of-world default.
   */
  tiktokRegion?: string | null
  /** Present only when this send must obey the 48-hour / 10-message window. */
  tiktokWindow?: { lastUserMessageAt: number | null; businessSends: number }
}

export interface SendOutcome {
  ok: boolean
  id?: string
  error?: string
  code?: number
  outsideWindow?: boolean
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface ChannelAdapter {
  channel: Channel
  /**
   * Standard customer-care window in milliseconds.
   * `null` means the channel has none (Telegram, website chat).
   * TikTok's documented window is 48 hours. WhatsApp is 24 hours;
   * outside that window only an approved template can be sent.
   */
  messagingWindowMs: number | null
  /** Instagram and Messenger can send the Meta Human Agent tag for up to 7 days. */
  supportsHumanAgent: boolean
  sendText(ctx: SendContext, text: string, quickReplies?: QuickReply[]): Promise<SendOutcome>
  sendCard(ctx: SendContext, card: OutboundCard): Promise<SendOutcome>
  sendCarousel?(ctx: SendContext, cards: OutboundCard[]): Promise<SendOutcome>
  sendMedia(ctx: SendContext, media: OutboundMedia, caption?: string): Promise<SendOutcome>
  sendList?(ctx: SendContext, list: OutboundList): Promise<SendOutcome>
  /** TikTok QA_BUTTON_CARD. Other adapters ignore it. */
  sendQaCard?(ctx: SendContext, questions: string[]): Promise<SendOutcome>
  privateReply?(ctx: SendContext, text: string, quickReplies?: QuickReply[]): Promise<SendOutcome>
  publicReply?(ctx: SendContext, commentId: string, text: string): Promise<SendOutcome>
  profile?(ctx: SendContext, externalId: string): Promise<{ name?: string; username?: string } | null>
  markSeen?(ctx: SendContext, messageId?: string): Promise<void>
  typing?(ctx: SendContext, on: boolean): Promise<void>
}

export type InboundKind =
  | "comment"
  | "dm"
  | "postback"
  | "story_mention"
  | "story_reaction"
  | "story_reply"

export interface NormalizedInbound {
  channel: Channel
  kind: InboundKind
  contactExternalId: string
  text: string
  messageId?: string
  commentId?: string
  mediaId?: string | null
  parentId?: string | null
  displayName?: string
  username?: string
  occurredAtMs?: number
  reaction?: string
  /**
   * Shared by a story event and the DM twin of the same messaging payload.
   * If the story rule sends, the DM twin is not sent again.
   */
  groupId?: string
  chatId?: string
  /** Page id, Instagram entry id, WhatsApp phone-number id, TikTok open id, or widget key. */
  accountRef?: string
  /** ig.me / m.me / tiktok.me `ref` parameter, when the channel includes one. */
  referral?: string
  /**
   * TikTok comments only.
   * `organic` is comment.update and must not send a DM.
   * `direct` is a high-intent comment and may use Comment-to-Message.
   */
  commentSurface?: "organic" | "direct"
}

export interface AutomationRule {
  id: string
  name?: string
  platform?: string | null
  trigger_source?: string | null
  trigger_type?: string | null
  trigger_value?: string | null
  specific_media_id?: string | null
  response_content?: unknown
  automation_variants?: Array<{
    id: string
    traffic_weight?: number | null
    response_config?: unknown
  }>
}

export interface ChannelPolicy {
  commentMatch: "instagram" | "facebook"
  /** Messenger and Telegram fall through to reply-all. Instagram and WhatsApp do not. */
  dmReplyAll: boolean
  iceBreakers: boolean
  followGate: boolean
  privateReplyStyle: "instagram_card" | "append_links" | "none"
  conversationPlatform: string
  eventPlatform: string
  outboundEventType: string
  aiChannelName: string
}

export type Db = {
  from: (table: string) => any
}
