import type * as React from "react"

export interface ActivityEvent {
  id: string
  type: "ai_lead" | "order" | "takeover" | "broadcast" | "token_warning" | "message" | "story_reply" | "postback" | "comment_trigger"
  actor?: string
  recipient?: string
  content?: string
  secondaryContent?: string
  channel: "instagram" | "whatsapp" | "messenger" | "tiktok" | "telegram" | "webchat"
  amount?: string
  orderId?: string
  provider?: string
  flowName?: string
  reason?: string
  stats?: { opened?: string; clicked?: string }
  createdAt: string
  unread?: boolean
}

/**
 * Format activity events into human-readable strings with bold actors and localized copy.
 */
export function formatEventLabel(event: ActivityEvent, lang: "en" | "ar" = "en"): {
  title: string
  actorHighlight?: string
  subtitle?: string
  isRtlSubtitle?: boolean
} {
  const isAr = lang === "ar"

  switch (event.type) {
    case "ai_lead":
      return {
        title: isAr
          ? `قام وكيل الذكاء الاصطناعي بتأهيل عميل من `
          : `AI Agent qualified a lead from `,
        actorHighlight: `@${event.recipient || "customer"}`,
        subtitle: event.content || (isAr ? "عايزة أعرف السيروم ينفع للبشرة الحساسة؟" : "Customer asked about product details"),
        isRtlSubtitle: true,
      }

    case "order":
      return {
        title: isAr
          ? `طلب #${event.orderId || "1042"} مدفوع · ${event.amount || "1,350 ج.م"} عبر رابط ${event.provider || "Paymob"} في محادثة واتساب`
          : `Order #${event.orderId || "1042"} paid · ${event.amount || "EGP 1,350"} via ${event.provider || "Paymob"} link in WhatsApp thread`,
        subtitle: isAr
          ? `منسوب لمسار "${event.flowName || "Glow kit — تعليق ريلز"}"`
          : `Attributed to flow "${event.flowName || "Glow kit — Reel comment"}"`,
      }

    case "takeover":
      return {
        title: isAr
          ? `استلمت ${event.actor || "لينا م."} محادثة من الذكاء الاصطناعي`
          : `${event.actor || "Lina M."} took over a conversation from AI`,
        subtitle: isAr
          ? `السبب: ${event.reason || "طلب العميل استرداد المبلغ"}`
          : `Reason: ${event.reason || "customer asked for a refund"}`,
      }

    case "broadcast":
      return {
        title: isAr
          ? `تم إرسال بث "${event.content || "الجمعة البيضاء"}" إلى ${event.recipient || "2,410"} جهة اتصال`
          : `Broadcast "${event.content || "White Friday early access"}" sent to ${event.recipient || "2,410"} contacts`,
        subtitle: event.stats
          ? `${event.stats.opened || "41%"} opened · ${event.stats.clicked || "9.8%"} clicked`
          : undefined,
      }

    case "token_warning":
      return {
        title: isAr
          ? `ينتهي تصريح انستغرام خلال 6 أيام. أعد الربط لتجنب فقدان الرسائل.`
          : `Instagram token expires in 6 days. Reconnect to avoid missed DMs.`,
      }

    default:
      return {
        title: isAr
          ? `تم إرسال رسالة تلقائية إلى `
          : `Automated message sent to `,
        actorHighlight: `@${event.recipient || "customer"}`,
        subtitle: event.content,
      }
  }
}

/**
 * Maps system event payloads into human-readable sentences.
 * Guarantees that raw action codes (ACT::...) or JSON payloads never leak into the UI.
 */
export function describeEvent(event: any, lang: "en" | "ar" = "en"): string {
  const isAr = lang === "ar"
  if (!event) return isAr ? "تفاعل" : "Interaction"

  // If passed a string (e.g. raw message preview)
  if (typeof event === "string") {
    return formatMessagePreview(event, lang)
  }

  const type = (event.type || event.event_type || "").toLowerCase()
  const payload = event.payload || event.data || {}

  if (type === "postback" || type === "button_tap" || type === "quick_reply") {
    const title = event.title || payload.title || payload.button_text
    if (title) {
      return isAr ? `ضغط على زر "${title}"` : `Tapped button "${title}"`
    }
    return isAr ? "ضغط على زر" : "Tapped a button"
  }

  if (type === "story_reply" || type === "story_mention") {
    return isAr ? "رد على قصتك" : "Replied to your story"
  }

  if (type === "comment_trigger" || type === "comment") {
    const keyword = event.keyword || payload.keyword || "price"
    const postType = event.postType || payload.postType || "Reel"
    const flowName = event.flowName || payload.flowName || "Glow kit"
    if (flowName) {
      return isAr
        ? `بدأ بتعليق "${keyword}" على ${postType} · مسار ${flowName}`
        : `Started by comment "${keyword}" on ${postType} · flow ${flowName}`
    }
    return isAr
      ? `بدأ بتعليق "${keyword}" على ${postType}`
      : `Started by comment "${keyword}" on ${postType}`
  }

  if (type === "ai_handoff" || type === "handoff") {
    const reason = event.reason || payload.reason || "shipping question not in knowledge base"
    const name = event.assignedTo || event.actor || payload.assignedTo || (isAr ? "فريق العمل" : "Team")
    return isAr
      ? `تم إيقاف الذكاء الاصطناعي مؤقتاً: ${reason} · تم الإسناد إلى ${name}`
      : `AI paused: ${reason} · assigned to ${name}`
  }

  // Fallback for custom or unknown events: never return JSON or ACT::
  return isAr ? "تفاعل" : "Interaction"
}

/**
 * Sanitizes message previews for conversation lists.
 * Removes internal ACT:: codes and JSON objects.
 */
export function formatMessagePreview(preview?: string | null, lang: "en" | "ar" = "en"): string {
  if (!preview) return lang === "ar" ? "لا توجد رسائل بعد" : "No messages yet"

  const trimmed = preview.trim()

  // Match ACT:: button tap payloads
  if (/^ACT::/i.test(trimmed)) {
    return lang === "ar" ? 'ضغط على زر "احصل على السعر"' : 'Tapped button "Get the price"'
  }

  // Match JSON payloads e.g. {"postback_id": ...}
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.postback_id || parsed.payload || parsed.button) {
        const title = parsed.title || parsed.button || "Get the price"
        return lang === "ar" ? `ضغط على زر "${title}"` : `Tapped button "${title}"`
      }
    } catch {
      // not valid json, continue
    }
    return lang === "ar" ? "تفاعل" : "Interaction"
  }

  return trimmed
}

/**
 * Computes Meta's 24-hour messaging window countdown.
 */
export function getWindowCountdown(lastInboundAt?: string | Date | null, nowMs: number = Date.now()): {
  hours: number
  minutes: number
  formatted: string
  isClosed: boolean
  isWarning: boolean
} {
  if (!lastInboundAt) {
    return {
      hours: 0,
      minutes: 0,
      formatted: "Window closed",
      isClosed: true,
      isWarning: false,
    }
  }

  const inboundTime = typeof lastInboundAt === "string" ? new Date(lastInboundAt).getTime() : lastInboundAt.getTime()
  if (isNaN(inboundTime)) {
    return {
      hours: 0,
      minutes: 0,
      formatted: "Window closed",
      isClosed: true,
      isWarning: false,
    }
  }

  const now = nowMs
  const windowLimit = inboundTime + 24 * 60 * 60 * 1000
  const remainingMs = windowLimit - now

  if (remainingMs <= 0) {
    return {
      hours: 0,
      minutes: 0,
      formatted: "Window closed",
      isClosed: true,
      isWarning: false,
    }
  }

  const totalMinutes = Math.round(remainingMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return {
    hours,
    minutes,
    formatted: `${hours}h ${minutes}m left`,
    isClosed: false,
    isWarning: hours < 6,
  }
}

/**
 * Standard default activity items representing live automations when no live socket feed is available.
 */
export const DEFAULT_ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: "act-1",
    type: "ai_lead",
    channel: "instagram",
    recipient: "mariam.k",
    content: "عايزة أعرف السيروم ينفع للبشرة الحساسة؟ وبكام التوصيل لمدينة نصر",
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: "act-2",
    type: "order",
    channel: "whatsapp",
    orderId: "1042",
    amount: "EGP 1,350",
    provider: "Paymob",
    flowName: "Glow kit — Reel comment",
    createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
  },
  {
    id: "act-3",
    type: "takeover",
    channel: "messenger",
    actor: "Lina M.",
    reason: "customer asked for a refund",
    createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: "act-4",
    type: "broadcast",
    channel: "telegram",
    content: "White Friday early access",
    recipient: "2,410",
    stats: { opened: "41%", clicked: "9.8%" },
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: "act-5",
    type: "token_warning",
    channel: "instagram",
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
]
