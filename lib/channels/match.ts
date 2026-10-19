import type { AutomationRule, InboundKind, NormalizedInbound, OutboundContent } from "@/lib/channels/types"
import { parseContent, keywordMatches } from "@/lib/webhook-utils"
import { commentReplyOpen } from "@/lib/channels/window"
import { isKnownTikTokIntent, matchTikTokIntent } from "@/lib/tiktok/intents"

export function matchesSpecificPost(specificMediaId?: string | null, eventPostId?: string | null): boolean {
  if (!specificMediaId || !eventPostId) return false
  const stored = String(specificMediaId).trim()
  const eventId = String(eventPostId).trim()
  if (!stored || !eventId) return false
  if (stored === eventId) return true
  return eventId.endsWith(`_${stored}`) || stored.endsWith(`_${eventId}`)
}

function postMatches(rule: AutomationRule, mediaId: string | null | undefined, mode: "instagram" | "facebook"): boolean {
  if (!rule.specific_media_id || !mediaId) return false
  if (mode === "facebook") return matchesSpecificPost(rule.specific_media_id, mediaId)
  return String(rule.specific_media_id) === String(mediaId)
}

function isCommentRule(rule: AutomationRule): boolean {
  if (rule.platform === "telegram" || rule.platform === "whatsapp" || rule.platform === "webchat") return false
  return rule.trigger_source === "comment"
}

function isDmRule(rule: AutomationRule, includeUntyped: boolean): boolean {
  if (rule.trigger_source === "dm") return true
  if (rule.platform === "telegram" || rule.platform === "whatsapp" || rule.platform === "webchat") return true
  if (includeUntyped && !rule.trigger_source) return true
  return false
}

/**
 * Instagram: specific reply-all, specific keyword, global keyword, global reply-all.
 * Facebook: specific keyword, specific reply-all, global keyword, global reply-all.
 */
export function matchCommentRule(
  rules: AutomationRule[],
  input: { text: string; mediaId?: string | null; mode: "instagram" | "facebook"; includeUntyped?: boolean },
): AutomationRule | null {
  const pool = rules.filter((rule) => isCommentRule(rule) || (input.includeUntyped && !rule.trigger_source))
  const text = input.text || ""
  const specific = (type: string) =>
    pool.find(
      (rule) =>
        postMatches(rule, input.mediaId, input.mode) &&
        rule.trigger_type === type &&
        (type !== "keyword" || keywordMatches(rule.trigger_value || "", text)),
    )
  const global = (type: string) =>
    pool.find(
      (rule) =>
        !rule.specific_media_id &&
        rule.trigger_type === type &&
        (type !== "keyword" || keywordMatches(rule.trigger_value || "", text)),
    )

  if (input.mode === "instagram") {
    return specific("reply_all") || specific("keyword") || global("keyword") || global("reply_all") || null
  }
  return specific("keyword") || specific("reply_all") || global("keyword") || global("reply_all") || null
}

export interface DmMatch {
  kind: "rule" | "preset"
  rule: AutomationRule | null
  content?: unknown
  name?: string
}

export function interpretPostback(rules: AutomationRule[], payload: string): DmMatch | null {
  if (payload.startsWith("UNLOCK_CONTENT_")) {
    const ruleId = payload.slice("UNLOCK_CONTENT_".length)
    const rule = rules.find((item) => item.id === ruleId) || null
    return rule ? { kind: "rule", rule, name: rule.name } : null
  }
  if (payload.startsWith("SYS_CARD_")) {
    const parts = payload.split("_")
    const ruleId = parts[2]
    const variantId = parts.length > 3 && parts[3] !== "default" ? parts.slice(3).join("_") : null
    const rule = rules.find((item) => item.id === ruleId)
    if (!rule) return null
    let content = rule.response_content
    if (variantId && rule.automation_variants) {
      const variant = rule.automation_variants.find((item) => item.id === variantId)
      if (variant) content = variant.response_config
    }
    return { kind: "preset", rule, content, name: "System Card Reply" }
  }
  return null
}

export function matchDmRule(
  rules: AutomationRule[],
  input: { triggerType: "keyword" | "postback"; text: string; replyAll: boolean; includeUntyped?: boolean; channel?: string },
): AutomationRule | null {
  const pool = rules.filter((rule) => isDmRule(rule, input.includeUntyped !== false))
  if (input.triggerType === "postback") {
    const exact = pool.find((rule) => rule.trigger_type === "postback" && rule.trigger_value === input.text)
    if (exact) return exact
    const keyword = pool.find((rule) => rule.trigger_type === "keyword" && keywordMatches(rule.trigger_value || "", input.text))
    if (keyword) return keyword
    return null
  }
  const keyword = pool.find((rule) => rule.trigger_type === "keyword" && keywordMatches(rule.trigger_value || "", input.text))
  if (keyword) return keyword
  if (input.channel === "tiktok") {
    const intent = pool.find((rule) => {
      const name = rule.trigger_value || ""
      if (rule.trigger_type === "intent") return matchTikTokIntent(name, input.text)
      if (rule.trigger_type === "keyword" && isKnownTikTokIntent(name)) return matchTikTokIntent(name, input.text)
      return false
    })
    if (intent) return intent
  }
  if (input.replyAll) {
    return pool.find((rule) => rule.trigger_type === "reply_all") || null
  }
  return null
}

export function matchStoryRule(rules: AutomationRule[], event: NormalizedInbound): AutomationRule | null {
  const pool = rules.filter((rule) => rule.trigger_source === "story")
  if (pool.length === 0) return null
  if (event.kind === "story_mention") {
    return (
      pool.find(
        (rule) =>
          rule.trigger_type === "mention" &&
          (!rule.specific_media_id || rule.specific_media_id === event.mediaId),
      ) || null
    )
  }
  if (event.kind === "story_reaction") {
    return (
      pool.find((rule) => {
        if (rule.trigger_type !== "reaction") return false
        if (rule.specific_media_id && rule.specific_media_id !== event.mediaId) return false
        const triggers = (rule.trigger_value || "").split(",").map((item) => item.trim())
        if (triggers.length > 0 && triggers[0] !== "ALL" && triggers[0] !== "ALL_REACTIONS" && triggers[0] !== "") {
          return triggers.includes(event.reaction || "")
        }
        return true
      }) || null
    )
  }
  if (event.kind === "story_reply") {
    return (
      pool.find((rule) => {
        if (rule.trigger_type !== "reply") return false
        if (rule.specific_media_id && rule.specific_media_id !== event.mediaId) return false
        const triggers = (rule.trigger_value || "").split(",").map((item) => item.trim())
        if (triggers.length > 0 && triggers[0] !== "ALL" && triggers[0] !== "ALL_MENTIONS" && triggers[0] !== "") {
          return keywordMatches(rule.trigger_value || "", event.text)
        }
        return true
      }) || null
    )
  }
  return null
}

export type PlannedAction =
  | { type: "skip_own"; event: NormalizedInbound }
  | { type: "skip_paused"; event: NormalizedInbound }
  | { type: "skip_stale_comment"; event: NormalizedInbound }
  | { type: "skip_nested"; event: NormalizedInbound }
  | { type: "skip_story_twin"; event: NormalizedInbound }
  | { type: "comment"; event: NormalizedInbound; rule: AutomationRule }
  | { type: "story"; event: NormalizedInbound; rule: AutomationRule }
  | { type: "dm"; event: NormalizedInbound; match: DmMatch }
  | { type: "unmatched_dm"; event: NormalizedInbound }
  | { type: "ignore"; event: NormalizedInbound }

export function planInboundActions(input: {
  events: NormalizedInbound[]
  rules: AutomationRule[]
  commentMatch: "instagram" | "facebook"
  dmReplyAll: boolean
  includeUntypedComments?: boolean
  pausedIds?: Set<string>
  ownIds?: Set<string>
  now?: number
}): PlannedAction[] {
  const now = input.now ?? Date.now()
  const paused = input.pausedIds ?? new Set<string>()
  const own = input.ownIds ?? new Set<string>()
  const handledGroups = new Set<string>()
  const actions: PlannedAction[] = []

  const ordered = [
    ...input.events.filter((event) => event.kind.startsWith("story")),
    ...input.events.filter((event) => !event.kind.startsWith("story")),
  ]

  for (const event of ordered) {
    if (own.has(event.contactExternalId)) {
      actions.push({ type: "skip_own", event })
      continue
    }
    if (paused.has(event.contactExternalId)) {
      actions.push({ type: "skip_paused", event })
      continue
    }

    if (event.kind.startsWith("story")) {
      const rule = matchStoryRule(input.rules, event)
      if (rule) {
        if (event.groupId) handledGroups.add(event.groupId)
        actions.push({ type: "story", event, rule })
      } else {
        actions.push({ type: "ignore", event })
      }
      continue
    }

    if ((event.kind === "dm" || event.kind === "postback") && event.groupId && handledGroups.has(event.groupId)) {
      actions.push({ type: "skip_story_twin", event })
      continue
    }

    if (event.kind === "comment") {
      if (!commentReplyOpen(event.occurredAtMs, now)) {
        actions.push({ type: "skip_stale_comment", event })
        continue
      }
      const rule = matchCommentRule(input.rules, {
        text: event.text,
        mediaId: event.mediaId,
        mode: input.commentMatch,
        includeUntyped: input.includeUntypedComments,
      })
      if (!rule) {
        actions.push({ type: "ignore", event })
        continue
      }
      const content = parseContent(rule.response_content) as OutboundContent
      if (event.parentId && content.include_replies !== true) {
        actions.push({ type: "skip_nested", event })
        continue
      }
      actions.push({ type: "comment", event, rule })
      continue
    }

    if (event.kind === "dm" || event.kind === "postback") {
      if (event.kind === "postback") {
        const special = interpretPostback(input.rules, event.text)
        if (special) {
          actions.push({ type: "dm", event, match: special })
          continue
        }
        if (event.text.startsWith("ICE_BREAKER_")) {
          actions.push({ type: "unmatched_dm", event })
          continue
        }
      }
      const rule = matchDmRule(input.rules, {
        triggerType: event.kind === "postback" ? "postback" : "keyword",
        text: event.text,
        replyAll: input.dmReplyAll,
        channel: event.channel,
      })
      if (rule) actions.push({ type: "dm", event, match: { kind: "rule", rule } })
      else actions.push({ type: "unmatched_dm", event })
      continue
    }

    actions.push({ type: "ignore", event })
  }

  return actions
}

export function isStoryKind(kind: InboundKind): boolean {
  return kind === "story_mention" || kind === "story_reaction" || kind === "story_reply"
}
