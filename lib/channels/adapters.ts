import { FACEBOOK_GRAPH_BASE, INSTAGRAM_GRAPH_BASE } from "@/lib/graph"
import { tiktokMessagingEnabled } from "@/lib/tiktok/config"
import { publicCommentReplyBody, suggestedQuestionsBody } from "@/lib/tiktok/features"
import { allowTikTokRequest, judgeTikTokSend } from "@/lib/tiktok/quota"
import { commentToMessageAllowed, dmMessagingAllowed } from "@/lib/tiktok/region"
import type {
  ChannelAdapter,
  FetchLike,
  OutboundButton,
  OutboundCard,
  OutboundMedia,
  QuickReply,
  SendContext,
  SendOutcome,
} from "@/lib/channels/types"
import { defaultFetch, graphOutcome, postJson } from "@/lib/channels/http"

const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000

function quickReplies(replies: QuickReply[] | undefined, limit: number) {
  return (replies || [])
    .filter((reply) => reply?.title)
    .slice(0, limit)
    .map((reply) => ({
      content_type: "text",
      title: reply.title.slice(0, 20),
      payload: reply.payload || `QR_${reply.title.toUpperCase().replace(/\s+/g, "_")}`,
    }))
}

function cardElements(card: OutboundCard) {
  const buttons = (card.buttons || [])
    .filter((button) => button.title)
    .map((button) => ({
      type: button.type,
      title: button.title,
      url: button.type === "web_url" ? button.url : undefined,
      payload: button.type === "postback" ? button.payload : undefined,
    }))
  const element: Record<string, unknown> = { title: card.title, buttons }
  if (card.subtitle) element.subtitle = card.subtitle
  if (card.image_url?.startsWith("http")) element.image_url = card.image_url
  return element
}

function metaBody(
  channel: "instagram" | "messenger" | "facebook",
  ctx: SendContext,
  message: unknown,
) {
  const recipient = ctx.commentId ? { comment_id: ctx.commentId } : { id: ctx.recipientId }
  const body: Record<string, unknown> = { recipient, message }
  // Instagram Login rejects a bare messaging_type on ordinary replies. The
  // Human Agent tag is the only extra field that path needs. Messenger's Send
  // API requires messaging_type on every call.
  if (channel === "instagram") {
    if (ctx.tag) {
      body.tag = ctx.tag
      body.messaging_type = "MESSAGE_TAG"
    }
    return body
  }
  body.messaging_type = ctx.tag ? "MESSAGE_TAG" : ctx.messagingType || "RESPONSE"
  if (ctx.tag) body.tag = ctx.tag
  return body
}

function createMetaAdapter(input: {
  channel: "instagram" | "messenger" | "facebook"
  graphBase: string
  supportsHumanAgent: boolean
  fetchImpl: FetchLike
  commentReplyPath: "replies" | "comments"
}): ChannelAdapter {
  const send = async (ctx: SendContext, message: unknown): Promise<SendOutcome> => {
    const url = `${input.graphBase}/me/messages?access_token=${encodeURIComponent(ctx.accessToken)}`
    const result = await postJson(input.fetchImpl, url, metaBody(input.channel, ctx, message))
    return graphOutcome(result.json)
  }

  return {
    channel: input.channel,
    messagingWindowMs: STANDARD_WINDOW_MS,
    supportsHumanAgent: input.supportsHumanAgent,
    async sendText(ctx, text, replies) {
      const message: Record<string, unknown> = { text }
      const packed = quickReplies(replies, 13)
      if (packed.length) message.quick_replies = packed
      return send(ctx, message)
    },
    async sendCard(ctx, card) {
      return send(ctx, {
        attachment: { type: "template", payload: { template_type: "generic", elements: [cardElements(card)] } },
      })
    },
    async sendCarousel(ctx, cards) {
      return send(ctx, {
        attachment: {
          type: "template",
          payload: { template_type: "generic", elements: cards.slice(0, 10).map(cardElements) },
        },
      })
    },
    async sendMedia(ctx, media) {
      return send(ctx, { attachment: { type: media.type || "image", payload: { url: media.url } } })
    },
    async privateReply(ctx, text, replies) {
      return this.sendText({ ...ctx, recipientId: undefined }, text, replies)
    },
    async publicReply(ctx, commentId, message) {
      const url = `${input.graphBase}/${commentId}/${input.commentReplyPath}?access_token=${encodeURIComponent(ctx.accessToken)}`
      const result = await postJson(input.fetchImpl, url, { message })
      return graphOutcome(result.json)
    },
    async profile(ctx, externalId) {
      const fields = input.channel === "instagram" ? "username,name" : "name"
      const url = `${input.graphBase}/${externalId}?fields=${fields}&access_token=${encodeURIComponent(ctx.accessToken)}`
      const response = await input.fetchImpl(url)
      const json = await response.json().catch(() => null)
      if (!json || json.error) return null
      return { username: json.username, name: json.name }
    },
    async typing(ctx, on) {
      if (!ctx.recipientId) return
      await postJson(
        input.fetchImpl,
        `${input.graphBase}/me/messages?access_token=${encodeURIComponent(ctx.accessToken)}`,
        { recipient: { id: ctx.recipientId }, sender_action: on ? "typing_on" : "typing_off" },
      )
    },
    async markSeen(ctx) {
      if (!ctx.recipientId) return
      await postJson(
        input.fetchImpl,
        `${input.graphBase}/me/messages?access_token=${encodeURIComponent(ctx.accessToken)}`,
        { recipient: { id: ctx.recipientId }, sender_action: "mark_seen" },
      )
    },
  }
}

function whatsappMediaKey(type: OutboundMedia["type"]): "image" | "video" | "audio" | "document" {
  if (type === "video" || type === "audio" || type === "document") return type
  return "image"
}

function whatsappList(text: string, replies: QuickReply[]): Record<string, unknown> {
  const rows = replies.slice(0, 10).map((reply, index) => ({
    id: (reply.payload || `row_${index + 1}`).slice(0, 200),
    title: reply.title.slice(0, 24),
  }))
  return {
    type: "list",
    body: { text: text.slice(0, 1024) },
    action: {
      button: "Options".slice(0, 20),
      sections: [{ title: "Choices".slice(0, 24), rows }],
    },
  }
}

export function createWhatsAppAdapter(fetchImpl: FetchLike = defaultFetch()): ChannelAdapter {
  const send = async (ctx: SendContext, body: Record<string, unknown>): Promise<SendOutcome> => {
    if (!ctx.senderRef) return { ok: false, error: "missing_phone_number_id" }
    const url = `${FACEBOOK_GRAPH_BASE}/${ctx.senderRef}/messages`
    const result = await postJson(fetchImpl, url, body, { Authorization: `Bearer ${ctx.accessToken}` })
    if (result.json?.error) return graphOutcome(result.json)
    return { ok: true, id: result.json?.messages?.[0]?.id }
  }

  return {
    channel: "whatsapp",
    messagingWindowMs: STANDARD_WINDOW_MS,
    supportsHumanAgent: false,
    async sendText(ctx, text, replies) {
      const body: Record<string, unknown> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: ctx.recipientId,
      }
      const buttons = (replies || []).filter((reply) => reply.title)
      if (buttons.length > 3) {
        body.type = "interactive"
        body.interactive = whatsappList(text, buttons)
      } else if (buttons.length) {
        body.type = "interactive"
        body.interactive = {
          type: "button",
          body: { text },
          action: {
            buttons: buttons.slice(0, 3).map((reply) => ({
              type: "reply",
              reply: { id: (reply.payload || reply.title).slice(0, 256), title: reply.title.slice(0, 20) },
            })),
          },
        }
      } else {
        body.type = "text"
        body.text = { body: text, preview_url: true }
      }
      return send(ctx, body)
    },
    async sendCard(ctx, card) {
      const links = (card.buttons || [])
        .filter((button) => button.type === "web_url" && button.url)
        .map((button) => `${button.title}: ${button.url}`)
        .join("\n")
      const replies = (card.buttons || [])
        .filter((button) => button.type === "postback")
        .map((button) => ({ title: button.title, payload: button.payload || button.title }))
      const text = [card.title, card.subtitle, links].filter(Boolean).join("\n\n")
      return this.sendText(ctx, text, replies)
    },
    async sendMedia(ctx, media, caption) {
      const key = whatsappMediaKey(media.type)
      const mediaBody: Record<string, unknown> = { link: media.url }
      if (caption && key !== "audio") mediaBody.caption = caption
      return send(ctx, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: ctx.recipientId,
        type: key,
        [key]: mediaBody,
      })
    },
    async sendList(ctx, list) {
      const sections = (list.sections || [])
        .map((section) => ({
          title: section.title?.slice(0, 24),
          rows: (section.rows || []).slice(0, 10).map((row) => ({
            id: row.id.slice(0, 200),
            title: row.title.slice(0, 24),
            description: row.description?.slice(0, 72),
          })),
        }))
        .filter((section) => section.rows.length > 0)
      const rows = sections.flatMap((section) => section.rows).slice(0, 10)
      return send(ctx, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: ctx.recipientId,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: (list.body || "Choose an option").slice(0, 1024) },
          action: {
            button: (list.button || "Options").slice(0, 20),
            sections: [{ title: sections[0]?.title, rows }],
          },
        },
      })
    },
    async markSeen(ctx, messageId) {
      if (!messageId || !ctx.senderRef) return
      await send(ctx, { messaging_product: "whatsapp", status: "read", message_id: messageId })
    },
  }
}

function escapeTgHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function telegramKeyboard(buttons: Array<OutboundButton | QuickReply> | undefined) {
  if (!buttons?.length) return undefined
  const rows = buttons.map((button) => {
    const title = button.title
    if ("type" in button && button.type === "web_url" && button.url && button.url.startsWith("http")) {
      return [{ text: title, url: button.url }]
    }
    const payload = ("payload" in button && button.payload) || ("url" in button && button.url) || title
    return [{ text: title, callback_data: payload }]
  })
  return { inline_keyboard: rows }
}

export function createTelegramAdapter(fetchImpl: FetchLike = defaultFetch()): ChannelAdapter {
  const call = async (token: string, method: string, body: Record<string, unknown>): Promise<SendOutcome> => {
    const result = await postJson(fetchImpl, `https://api.telegram.org/bot${token}/${method}`, body)
    if (result.json?.ok) return { ok: true, id: result.json.result?.message_id ? String(result.json.result.message_id) : undefined }
    return { ok: false, error: result.json?.description || "Telegram send failed" }
  }

  return {
    channel: "telegram",
    messagingWindowMs: null,
    supportsHumanAgent: false,
    async sendText(ctx, text, replies) {
      if (!ctx.recipientId) return { ok: false, error: "missing_chat" }
      return call(ctx.accessToken, "sendMessage", {
        chat_id: ctx.recipientId,
        text,
        reply_markup: telegramKeyboard(replies),
      })
    },
    async sendCard(ctx, card) {
      if (!ctx.recipientId) return { ok: false, error: "missing_chat" }
      const caption = `<b>${escapeTgHtml(card.title)}</b>${card.subtitle ? `\n\n${escapeTgHtml(card.subtitle)}` : ""}`
      const keyboard = telegramKeyboard(card.buttons)
      if (card.image_url?.startsWith("http")) {
        const photoOutcome = await call(ctx.accessToken, "sendPhoto", {
          chat_id: ctx.recipientId,
          photo: card.image_url,
          caption,
          parse_mode: "HTML",
          reply_markup: keyboard,
        })
        if (photoOutcome.ok) return photoOutcome
      }
      return call(ctx.accessToken, "sendMessage", {
        chat_id: ctx.recipientId,
        text: caption,
        parse_mode: "HTML",
        reply_markup: keyboard,
      })
    },
    async sendMedia(ctx, media, caption) {
      if (!ctx.recipientId) return { ok: false, error: "missing_chat" }
      return call(ctx.accessToken, "sendPhoto", {
        chat_id: ctx.recipientId,
        photo: media.url,
        caption,
      })
    },
    async typing(ctx) {
      if (!ctx.recipientId) return
      await call(ctx.accessToken, "sendChatAction", { chat_id: ctx.recipientId, action: "typing" })
    },
    async markSeen() {
      return undefined
    },
  }
}

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3"
export const TIKTOK_WINDOW_MS = 48 * 60 * 60 * 1000

function tiktokFailure(json: any, status: number): SendOutcome {
  const message = typeof json?.message === "string" ? json.message : "TikTok send failed"
  const outside = /48|window|expired conversation|outside/i.test(message)
  return { ok: false, error: message, code: typeof json?.code === "number" ? json.code : status, outsideWindow: outside }
}

/**
 * TikTok Business Messaging send.
 * Text goes to a conversation id (`recipient_type: CONVERSATION`).
 * Comment-to-DM uses the documented `direct_reply` object and only works for
 * a high-intent comment, and only when that feature flag is on.
 * Free-form buttons, lists, and URL media are not part of this API.
 */
function blockedDmRegion(ctx: SendContext): string | null {
  if (ctx.tiktokRegion === undefined) return null
  const decision = dmMessagingAllowed(ctx.tiktokRegion)
  return decision.allowed ? null : `tiktok_region_${decision.reason}`
}

export function createTikTokAdapter(fetchImpl: FetchLike = defaultFetch()): ChannelAdapter {
  const post = async (
    ctx: SendContext,
    body: Record<string, unknown>,
    options?: { senderAction?: boolean; commentReply?: boolean },
  ): Promise<SendOutcome> => {
    if (!tiktokMessagingEnabled()) return { ok: false, error: "tiktok_messaging_disabled" }
    if (!ctx.senderRef) return { ok: false, error: "missing_business_id" }
    if (!options?.senderAction) {
      const regionBlock = blockedDmRegion(ctx)
      if (regionBlock) return { ok: false, error: regionBlock }
      if (ctx.tiktokWindow) {
        const verdict = judgeTikTokSend({
          lastUserMessageAt: ctx.tiktokWindow.lastUserMessageAt,
          businessSends: ctx.tiktokWindow.businessSends,
          now: Date.now(),
          kind: options?.commentReply ? "comment_reply" : "reply",
        })
        if (!verdict.allowed) return { ok: false, error: verdict.reason }
      }
    }
    if (!allowTikTokRequest()) return { ok: false, error: "tiktok_rate_limited" }
    const result = await postJson(fetchImpl, `${TIKTOK_API}/business/message/send/`, body, {
      "Access-Token": ctx.accessToken,
    })
    if (result.json && result.json.code !== 0 && result.json.code !== undefined) return tiktokFailure(result.json, result.status)
    if (!result.ok) return tiktokFailure(result.json, result.status)
    return { ok: true, id: result.json?.data?.message?.message_id }
  }

  return {
    channel: "tiktok",
    messagingWindowMs: TIKTOK_WINDOW_MS,
    supportsHumanAgent: false,
    async sendText(ctx, text) {
      if (!ctx.recipientId) return { ok: false, error: "missing_conversation" }
      return post(ctx, {
        business_id: ctx.senderRef,
        recipient_type: "CONVERSATION",
        recipient: ctx.recipientId,
        message_type: "TEXT",
        text: { body: text },
      })
    },
    async sendCard(ctx, card) {
      const links = (card.buttons || [])
        .filter((button) => button.type === "web_url" && button.url)
        .map((button) => `${button.title}: ${button.url}`)
        .join("\n")
      const text = [card.title, card.subtitle, links].filter(Boolean).join("\n\n")
      return this.sendText(ctx, text)
    },
    async sendQaCard(ctx, questions) {
      if (!ctx.recipientId) return { ok: false, error: "missing_conversation" }
      const template = suggestedQuestionsBody(questions)
      if (!template) return { ok: false, error: "missing_questions" }
      return post(ctx, {
        business_id: ctx.senderRef,
        recipient_type: "CONVERSATION",
        recipient: ctx.recipientId,
        ...template,
      })
    },
    async sendMedia() {
      return {
        ok: false,
        error: "TikTok does not accept a media URL. Images must be uploaded with /business/message/media/upload/ and sent as a media_id.",
      }
    },
    async privateReply(ctx, text) {
      if (!commentToMessageAllowed(ctx.tiktokRegion)) return { ok: false, error: "tiktok_comment_to_dm_disabled" }
      if (!ctx.commentId) return { ok: false, error: "missing_comment" }
      return post(ctx, {
        business_id: ctx.senderRef,
        message_type: "TEXT",
        text: { body: text },
        direct_reply: {
          reply_type: "COMMENT_REPLY",
          comment_reply: { comment_id: ctx.commentId },
        },
      }, { commentReply: true })
    },
    async publicReply(ctx, commentId, text) {
      if (!tiktokMessagingEnabled()) return { ok: false, error: "tiktok_messaging_disabled" }
      if (!ctx.senderRef) return { ok: false, error: "missing_business_id" }
      const videoId = ctx.mediaId || ""
      if (!videoId) return { ok: false, error: "missing_video" }
      if (!allowTikTokRequest()) return { ok: false, error: "tiktok_rate_limited" }
      const result = await postJson(
        fetchImpl,
        `${TIKTOK_API}/business/comment/reply/create/`,
        publicCommentReplyBody({ businessId: ctx.senderRef, videoId, commentId, text }),
        { "Access-Token": ctx.accessToken },
      )
      if (result.json && result.json.code !== 0 && result.json.code !== undefined) return tiktokFailure(result.json, result.status)
      if (!result.ok) return tiktokFailure(result.json, result.status)
      return { ok: true, id: commentId }
    },
    async markSeen(ctx) {
      if (!ctx.recipientId || !ctx.senderRef) return
      await post(ctx, {
        business_id: ctx.senderRef,
        recipient_type: "CONVERSATION",
        recipient: ctx.recipientId,
        message_type: "SENDER_ACTION",
        sender_action: "MARK_READ",
      }, { senderAction: true })
    },
    async typing(ctx, on) {
      if (!on || !ctx.recipientId || !ctx.senderRef) return
      await post(ctx, {
        business_id: ctx.senderRef,
        recipient_type: "CONVERSATION",
        recipient: ctx.recipientId,
        message_type: "SENDER_ACTION",
        sender_action: "TYPING",
      }, { senderAction: true })
    },
  }
}

/** Website chat deliveries are rows in `messages`. The widget polls them. */
export function createWebchatAdapter(): ChannelAdapter {
  const ok = async (): Promise<SendOutcome> => ({ ok: true, id: `webchat_${Date.now()}` })
  return {
    channel: "webchat",
    messagingWindowMs: null,
    supportsHumanAgent: false,
    sendText: ok,
    sendCard: ok,
    sendMedia: ok,
    sendList: ok,
    privateReply: ok,
    markSeen: async () => undefined,
    typing: async () => undefined,
  }
}

export function createInstagramAdapter(fetchImpl?: FetchLike): ChannelAdapter {
  return createMetaAdapter({
    channel: "instagram",
    graphBase: INSTAGRAM_GRAPH_BASE,
    supportsHumanAgent: true,
    fetchImpl: fetchImpl || defaultFetch(),
    commentReplyPath: "replies",
  })
}

export function createMessengerAdapter(fetchImpl?: FetchLike): ChannelAdapter {
  return createMetaAdapter({
    channel: "messenger",
    graphBase: FACEBOOK_GRAPH_BASE,
    supportsHumanAgent: true,
    fetchImpl: fetchImpl || defaultFetch(),
    commentReplyPath: "comments",
  })
}

const instagram = createInstagramAdapter()
const messenger = createMessengerAdapter()
const whatsapp = createWhatsAppAdapter()
const telegram = createTelegramAdapter()
const tiktok = createTikTokAdapter()
const webchat = createWebchatAdapter()

/** Register a channel here. The matcher and the inbox only call `getAdapter`. */
export const channelAdapters = {
  instagram,
  messenger,
  facebook: messenger,
  whatsapp,
  telegram,
  tiktok,
  webchat,
} as const

export function getAdapter(channel: string): ChannelAdapter | null {
  if (channel in channelAdapters) return channelAdapters[channel as keyof typeof channelAdapters]
  return null
}
