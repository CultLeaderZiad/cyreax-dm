import { aiReplyEvent } from "@/lib/channel-ids"
import { telegramMessageId } from "@/lib/channel-ids"
import { checkTrialStatus, parseContent, pickRandom, pickVariant } from "@/lib/webhook-utils"
import { processLeadCapture } from "@/lib/lead-capture"
import { planInboundActions, type PlannedAction } from "@/lib/channels/match"
import { deliverContent, previewOf } from "@/lib/channels/deliver"
import {
  attachTrackedLinks,
  commentAlreadyHandled,
  ensureConversation,
  insertMessage,
  loadContact,
  logAutomationEvent,
  saveContactTouch,
} from "@/lib/channels/store"
import type {
  AutomationRule,
  ChannelAdapter,
  ChannelPolicy,
  Db,
  NormalizedInbound,
  OutboundContent,
  SendContext,
} from "@/lib/channels/types"
import { isBotPaused } from "@/lib/contacts"
import { botLocale, botText, followSubtitle, publicReplies, type BotLocale } from "@/lib/bot-copy"
import { commentLead, instagramCrossPostPlan, tiktokDmPlan } from "@/lib/tiktok/features"
import type { TikTokAccountSettings } from "@/lib/tiktok/settings"
import type { TikTokWindowState } from "@/lib/tiktok/quota"
import { recordTikTokBusinessSend, recordTikTokUserMessage } from "@/lib/tiktok/windows"

export interface TenantContext {
  userId: string | number
  workspaceId?: string | null
  username?: string | null
  accessToken: string
  senderRef?: string
  ownIds: string[]
  aiEnabled: boolean
  aiContext?: string | null
  pageId?: string | null
  locale?: BotLocale | null
  /** TikTok sign-up region. Null means unknown (DMs stay allowed). */
  tiktokRegion?: string | null
  tiktokSettings?: TikTokAccountSettings
  tiktokWindow?: TikTokWindowState
}

function tenantLocale(tenant: TenantContext): BotLocale {
  return botLocale(tenant.locale)
}

export async function accountMayAutomate(
  supabase: Db,
  account: { id: string; plan: string; trial_ends_at: string | null; trial_exempt: boolean | null; is_banned?: boolean | null } | null,
): Promise<boolean> {
  if (!account || account.is_banned) return false
  const plan = await checkTrialStatus(supabase, account)
  return plan !== "expired"
}

function sendContext(tenant: TenantContext, event: NormalizedInbound, comment = false): SendContext {
  return {
    accessToken: tenant.accessToken,
    recipientId: comment ? undefined : event.chatId || event.contactExternalId,
    commentId: comment ? event.commentId : undefined,
    senderRef: tenant.senderRef,
    messagingType: "RESPONSE",
    mediaId: event.mediaId,
    tiktokRegion: event.channel === "tiktok" ? (tenant.tiktokRegion ?? null) : undefined,
    tiktokWindow: event.channel === "tiktok" ? tenant.tiktokWindow : undefined,
  }
}

function tiktokUserInitiation(event: NormalizedInbound): boolean {
  if (event.channel !== "tiktok") return false
  if (event.kind === "dm" || event.kind === "postback") return true
  return event.kind === "comment" && event.commentSurface === "direct"
}

async function openTikTokWindow(supabase: Db, tenant: TenantContext, event: NormalizedInbound) {
  if (!tenant.senderRef) return
  const at = event.occurredAtMs || Date.now()
  tenant.tiktokWindow = await recordTikTokUserMessage(supabase, tenant.senderRef, event.contactExternalId, at)
}

async function noteTikTokSend(supabase: Db, tenant: TenantContext, event: NormalizedInbound, outcome: { ok: boolean }) {
  if (!outcome.ok || !tenant.tiktokWindow || !tenant.senderRef || event.channel !== "tiktok") return
  await recordTikTokBusinessSend(supabase, tenant.senderRef, event.contactExternalId, tenant.tiktokWindow)
}

function outboundId(channel: string): string {
  return `${channel}_out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function inboundId(event: NormalizedInbound): string {
  if (event.channel === "telegram") {
    return telegramMessageId(event.chatId || event.contactExternalId, event.messageId)
  }
  return event.messageId || `${event.channel}_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function touch(
  supabase: Db,
  tenant: TenantContext,
  event: NormalizedInbound,
  source: string,
  automationId?: string | null,
  lead?: { email?: string | null; phone?: string | null; name?: string | null },
) {
  const existing = await loadContact(supabase, tenant.userId, event.channel, event.contactExternalId)
  const now = new Date().toISOString()
  return saveContactTouch(
    supabase,
    existing,
    {
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      channel: event.channel,
      externalId: event.contactExternalId,
      displayName: lead?.name || event.displayName || null,
      username: event.username || null,
      source,
      sourceAutomationId: automationId,
      email: lead?.email,
      phone: lead?.phone,
      inboundAt: now,
    },
    now,
  )
}

async function pausedIds(supabase: Db, tenant: TenantContext, events: NormalizedInbound[]): Promise<Set<string>> {
  const ids = new Set<string>()
  const seen = new Set<string>()
  for (const event of events) {
    if (seen.has(event.contactExternalId)) continue
    seen.add(event.contactExternalId)
    const contact = await loadContact(supabase, tenant.userId, event.channel, event.contactExternalId)
    if (isBotPaused(contact)) ids.add(event.contactExternalId)
  }
  return ids
}

async function recordDirect(
  supabase: Db,
  tenant: TenantContext,
  policy: ChannelPolicy,
  event: NormalizedInbound,
  adapter: ChannelAdapter,
) {
  let username = event.username || event.displayName || ""
  if (!username && adapter.profile) {
    const profile = await adapter.profile(sendContext(tenant, event), event.contactExternalId)
    username = profile?.username || profile?.name || ""
  }
  if (!username) username = `${policy.aiChannelName} user`
  const conversation = await ensureConversation(supabase, {
    userId: tenant.userId,
    recipientId: event.contactExternalId,
    username,
    platform: policy.conversationPlatform,
    workspaceId: tenant.workspaceId,
    channelAccountId: tenant.senderRef || tenant.pageId || null,
    externalThreadId: event.channel === "tiktok" ? event.chatId || null : null,
  })
  if (conversation) {
    await insertMessage(supabase, {
      id: inboundId(event),
      conversation_id: conversation.id,
      user_id: tenant.userId,
      sender_id: event.contactExternalId,
      sender_username: username,
      content: event.text,
      direction: "in",
      platform: policy.conversationPlatform,
    })
  }
  return { conversation, username }
}

async function recordOutbound(
  supabase: Db,
  tenant: TenantContext,
  policy: ChannelPolicy,
  conversationId: string | undefined,
  content: string,
) {
  if (!conversationId) return
  await insertMessage(supabase, {
    id: outboundId(policy.conversationPlatform),
    conversation_id: conversationId,
    user_id: tenant.userId,
    sender_id: tenant.pageId || tenant.senderRef || tenant.userId,
    sender_username: tenant.username || "Bot",
    content,
    direction: "out",
    platform: policy.conversationPlatform,
  })
}

async function sendTracked(
  supabase: Db,
  adapter: ChannelAdapter,
  tenant: TenantContext,
  policy: ChannelPolicy,
  ctx: SendContext,
  content: OutboundContent,
  event: NormalizedInbound,
  options: { privateComment?: boolean; automationId?: string | null; variantId?: string | null },
) {
  const tracked = await attachTrackedLinks(supabase, content, {
    userId: tenant.userId,
    workspaceId: tenant.workspaceId,
    channel: policy.eventPlatform,
    contactExternalId: event.contactExternalId,
    automationId: options.automationId,
    variantId: options.variantId,
  })
  return deliverContent(adapter, ctx, tracked, {
    privateComment: options.privateComment,
    privateReplyStyle: policy.privateReplyStyle,
    automationId: options.automationId,
    variantId: options.variantId,
  })
}

async function runLead(
  supabase: Db,
  adapter: ChannelAdapter,
  tenant: TenantContext,
  event: NormalizedInbound,
  rule: { id: string },
  content: OutboundContent,
  username: string,
  commentId?: string,
) {
  const ctx = sendContext(tenant, event, Boolean(commentId))
  if (commentId) ctx.commentId = commentId
  return processLeadCapture(
    supabase as any,
    String(tenant.userId),
    event.contactExternalId,
    username,
    tenant.accessToken,
    event.text,
    rule,
    content,
    commentId,
    {
      locale: tenant.locale === "ar" ? "ar" : tenant.locale === "en" ? "en" : undefined,
      sendText: async (_token, recipient, text) => {
        const target: SendContext = {
          ...ctx,
          recipientId: recipient.id,
          commentId: recipient.comment_id,
        }
        await adapter.sendText(target, text)
      },
    },
  )
}

async function maybeAi(
  supabase: Db,
  adapter: ChannelAdapter,
  tenant: TenantContext,
  policy: ChannelPolicy,
  event: NormalizedInbound,
  conversationId?: string,
) {
  let aiActive = tenant.aiEnabled
  if (!aiActive) {
    try {
      const { data: aiSettings } = await supabase
        .from("ai_agent_settings")
        .select("enabled")
        .eq("user_id", tenant.userId)
        .maybeSingle()
      if (aiSettings && aiSettings.enabled !== false) {
        aiActive = true
      } else if (!aiSettings) {
        const { data: ks } = await supabase
          .from("knowledge_sources")
          .select("id")
          .eq("user_id", tenant.userId)
          .limit(1)
        if (ks && ks.length > 0) {
          aiActive = true
        }
      }
    } catch {
      // non-blocking
    }
  }
  if (!aiActive) return false
  try {
    const { accountIdForProfile, assertWithinLimit, incrementMeter, loadAccount, PlanLimitError } = await import("@/lib/billing/enforce")
    const accountId = await accountIdForProfile(supabase, tenant.userId)
    const account = accountId ? await loadAccount(supabase, accountId) : null
    if (account) {
      try {
        await assertWithinLimit(supabase, account, "aiReplies", 1)
      } catch (error) {
        if (error instanceof PlanLimitError) return false
        throw error
      }
    }
    const { fetchConversationHistory } = await import("@/lib/llm-provider")
    const { historyRole } = await import("@/lib/analytics-metrics")
    const { answerWithWorkspaceAgent } = await import("@/lib/ai-agent/service")
    const history = await fetchConversationHistory(conversationId, 8)
    const decision = await answerWithWorkspaceAgent({
      supabase,
      userId: tenant.userId,
      workspaceId: tenant.workspaceId,
      accountId: accountId || null,
      message: event.text,
      history: history.map((item) => ({ role: historyRole(item) === "assistant" ? "assistant" as const : "user" as const, content: item.content })),
      goal: tenant.aiContext || null,
      channel: event.channel,
      contactExternalId: event.contactExternalId,
      contactName: event.displayName || event.username || null,
      conversationId: conversationId || null,
    })
    if (!decision?.reply) return false
    const content = { message: decision.reply }
    await sendTracked(supabase, adapter, tenant, policy, sendContext(tenant, event), content, event, {})
    await recordOutbound(supabase, tenant, policy, conversationId, decision.reply)
    await logAutomationEvent(
      supabase,
      aiReplyEvent({ userId: tenant.userId, platform: policy.eventPlatform, recipientId: event.contactExternalId }),
    )
    if (accountId) await incrementMeter(supabase, accountId, "aiReplies", 1)
    return true
  } catch (error) {
    console.error("[pipeline] AI reply failed:", error)
    return false
  }
}

async function iceBreaker(
  supabase: Db,
  tenant: TenantContext,
  event: NormalizedInbound,
): Promise<OutboundContent | null> {
  if (event.kind === "postback" && event.text.startsWith("ICE_BREAKER_")) {
    const id = event.text.slice("ICE_BREAKER_".length)
    const { data } = await supabase.from("ice_breakers").select("*").eq("id", id).eq("user_id", tenant.userId).maybeSingle()
    return data ? { message: data.response } : null
  }
  if (event.kind !== "dm") return null
  const { data } = await supabase.from("ice_breakers").select("*").eq("user_id", tenant.userId)
  const match = (data || []).find((row: any) => String(row.question || "").toLowerCase().trim() === event.text.toLowerCase().trim())
  return match ? { message: match.response } : null
}

async function leadStateRule(supabase: Db, tenant: TenantContext, event: NormalizedInbound, rules: AutomationRule[]) {
  const { data } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("user_id", tenant.userId)
    .eq("ig_user_id", event.contactExternalId)
    .maybeSingle()
  if (!data?.automation_id) return null
  return rules.find((rule) => rule.id === data.automation_id) || null
}

export async function runChannelPipeline(input: {
  supabase: Db
  adapter: ChannelAdapter
  tenant: TenantContext
  rules: AutomationRule[]
  events: NormalizedInbound[]
  policy: ChannelPolicy
  onComment?: (info: { postId: string | null; commentId: string; text: string }) => void
}): Promise<void> {
  const { supabase, adapter, tenant, rules, events, policy } = input
  if (events.length === 0) return
  const paused = await pausedIds(supabase, tenant, events)
  const actions = planInboundActions({
    events,
    rules,
    commentMatch: policy.commentMatch,
    dmReplyAll: policy.dmReplyAll,
    includeUntypedComments: policy.commentMatch === "facebook",
    pausedIds: paused,
    ownIds: new Set(tenant.ownIds.filter(Boolean)),
  })

  for (const action of actions) {
    try {
      await runAction(action, input, paused)
    } catch (error) {
      console.error("[pipeline] action failed:", error)
      throw error
    }
  }
  try {
    const { dispatchFlowTriggers } = await import("@/lib/flows/runtime")
    await dispatchFlowTriggers(supabase, { userId: tenant.userId, workspaceId: tenant.workspaceId }, events)
  } catch (error) {
    console.error("[pipeline] flow dispatch failed:", error)
    throw error
  }
}

async function runAction(
  action: PlannedAction,
  input: {
    supabase: Db
    adapter: ChannelAdapter
    tenant: TenantContext
    rules: AutomationRule[]
    policy: ChannelPolicy
    onComment?: (info: { postId: string | null; commentId: string; text: string }) => void
  },
  paused: Set<string>,
) {
  const { supabase, adapter, tenant, rules, policy } = input
  const event = action.event
  const direct = event.kind === "dm" || event.kind === "postback"

  if (action.type === "skip_own" || action.type === "ignore" || action.type === "skip_story_twin" || action.type === "skip_stale_comment" || action.type === "skip_nested") {
    return
  }

  if (tiktokUserInitiation(event)) {
    await openTikTokWindow(supabase, tenant, event)
  }

  if (action.type === "skip_paused") {
    await touch(supabase, tenant, event, event.kind)
    if (direct) await recordDirect(supabase, tenant, policy, event, adapter)
    return
  }

  const ruleId =
    action.type === "comment" || action.type === "story"
      ? action.rule.id
      : action.type === "dm"
        ? action.match.rule?.id
        : null
  if (ruleId) {
    const { flowSupersedesAutomation } = await import("@/lib/flows/runtime")
    if (await flowSupersedesAutomation(supabase, tenant.userId, ruleId)) return
  }

  if (action.type === "comment" && event.commentId) {
    if (await commentAlreadyHandled(supabase, event.commentId)) return
    const { content: raw, variantId } = pickVariant(action.rule)
    const content = parseContent(raw) as OutboundContent
    const mode = content.reply_mode || "both"
    const organicTikTok = event.channel === "tiktok" && event.commentSurface === "organic"
    if (mode !== "dm_only" && adapter.publicReply) {
      const pool = (content.public_replies || []).filter(Boolean)
      await adapter.publicReply(sendContext(tenant, event, true), event.commentId, pickRandom(pool.length ? pool : publicReplies(tenantLocale(tenant))))
    }
    if (mode !== "public_only" && !organicTikTok) {
      const lead = await runLead(supabase, adapter, tenant, event, action.rule, content, event.displayName || "User", event.commentId)
      if (lead.shouldContinue) {
        const sent = await sendTracked(supabase, adapter, tenant, policy, sendContext(tenant, event, true), content, event, {
          privateComment: true,
          automationId: action.rule.id,
          variantId,
        })
        await noteTikTokSend(supabase, tenant, event, sent)
      }
      if (lead.lead) await touch(supabase, tenant, event, "comment", action.rule.id, lead.lead)
    }
    const leadSource = organicTikTok ? "tiktok_comment" : "comment"
    const shaped = organicTikTok
      ? commentLead({
          uniqueIdentifier: event.contactExternalId,
          username: event.username,
          text: event.text,
          videoId: event.mediaId,
          commentId: event.commentId,
        })
      : null
    await touch(supabase, tenant, event, leadSource, action.rule.id, shaped?.username ? { name: shaped.username } : undefined)
    if (organicTikTok && content.cross_post_instagram) {
      const plan = instagramCrossPostPlan(action.rule.trigger_value || event.text)
      await logAutomationEvent(supabase, {
        user_id: tenant.userId,
        automation_id: action.rule.id,
        event_type: "comment_cross_post",
        recipient_id: event.contactExternalId,
        platform: plan.channel,
        variant_id: variantId,
        comment_id: event.commentId,
      })
    }
    await logAutomationEvent(supabase, {
      user_id: tenant.userId,
      automation_id: action.rule.id,
      event_type: policy.commentMatch === "instagram" ? "comment_dm" : "sent",
      recipient_id: event.contactExternalId,
      platform: policy.eventPlatform,
      variant_id: variantId,
      comment_id: event.commentId,
    })
    input.onComment?.({ postId: event.mediaId || null, commentId: event.commentId, text: event.text })
    return
  }

  if (action.type === "story") {
    const { content: raw, variantId } = pickVariant(action.rule)
    const content = parseContent(raw) as OutboundContent
    const lead = await runLead(supabase, adapter, tenant, event, action.rule, content, event.displayName || "User")
    if (lead.shouldContinue) {
      await sendTracked(supabase, adapter, tenant, policy, sendContext(tenant, event), content, event, {
        automationId: action.rule.id,
        variantId,
      })
    }
    await touch(supabase, tenant, event, event.kind, action.rule.id, lead.lead)
    await logAutomationEvent(supabase, {
      user_id: tenant.userId,
      automation_id: action.rule.id,
      event_type: "story_reply",
      recipient_id: event.contactExternalId,
      platform: policy.eventPlatform,
      variant_id: variantId,
    })
    return
  }

  if (!direct) return
  if (paused.has(event.contactExternalId)) return

  const priorContact = event.channel === "tiktok"
    ? await loadContact(supabase, tenant.userId, event.channel, event.contactExternalId)
    : null
  const recorded = await recordDirect(supabase, tenant, policy, event, adapter)
  await touch(supabase, tenant, event, event.kind)
  if (event.channel === "tiktok" && tenant.tiktokSettings) {
    const plan = tiktokDmPlan({
      firstSeen: !priorContact,
      matched: action.type === "dm",
      welcome: tenant.tiktokSettings.welcome,
      defaultReply: tenant.tiktokSettings.defaultReply,
      suggestedQuestions: tenant.tiktokSettings.suggestedQuestions,
    })
    if (plan.sendWelcome) {
      const welcome = await adapter.sendText(sendContext(tenant, event), tenant.tiktokSettings.welcome)
      await noteTikTokSend(supabase, tenant, event, welcome)
    }
    if (plan.sendQuestions && adapter.sendQaCard) {
      const card = await adapter.sendQaCard(sendContext(tenant, event), tenant.tiktokSettings.suggestedQuestions)
      await noteTikTokSend(supabase, tenant, event, card)
    }
    if (plan.sendDefault && action.type !== "dm") {
      const fallback = await adapter.sendText(sendContext(tenant, event), tenant.tiktokSettings.defaultReply)
      await noteTikTokSend(supabase, tenant, event, fallback)
      await recordOutbound(supabase, tenant, policy, recorded.conversation?.id, tenant.tiktokSettings.defaultReply)
      return
    }
  }
  if (event.channel === "whatsapp" && event.messageId && adapter.markSeen) {
    await adapter.markSeen(sendContext(tenant, event), event.messageId)
  }

  let matchRule: AutomationRule | null = action.type === "dm" ? action.match.rule : null
  let preset: OutboundContent | null = null
  if (action.type === "dm" && action.match.kind === "preset") {
    preset = parseContent(action.match.content) as OutboundContent
  }
  if (!matchRule && !preset && policy.iceBreakers) {
    preset = await iceBreaker(supabase, tenant, event)
  }
  if (!matchRule && !preset) {
    matchRule = await leadStateRule(supabase, tenant, event, rules)
  }
  if (!matchRule && !preset) {
    await maybeAi(supabase, adapter, tenant, policy, event, recorded.conversation?.id)
    return
  }

  const picked = matchRule ? pickVariant(matchRule) : { content: preset, variantId: null as string | null }
  const content = (preset || parseContent(picked.content)) as OutboundContent
  const variantId = picked.variantId
  const isUnlock = event.kind === "postback" && event.text.startsWith("UNLOCK_CONTENT_")

  if (policy.followGate && content.check_follow === true && !isUnlock && matchRule) {
    const locale = tenantLocale(tenant)
    await adapter.sendCard(sendContext(tenant, event), {
      title: botText(locale, "contentLocked"),
      subtitle: followSubtitle(locale, tenant.username || "us"),
      buttons: [
        { type: "web_url", title: botText(locale, "follow"), url: `https://instagram.com/${tenant.username || ""}` },
        { type: "postback", title: botText(locale, "followed"), payload: `UNLOCK_CONTENT_${matchRule.id}` },
      ],
    })
    await recordOutbound(supabase, tenant, policy, recorded.conversation?.id, "[Locked Content Gate]")
    return
  }

  const ruleForLead = matchRule || { id: "preset" }
  const lead = await runLead(
    supabase,
    adapter,
    tenant,
    event,
    ruleForLead,
    content,
    recorded.username,
  )
  if (!lead.shouldContinue) {
    if (lead.replyTextLog) await recordOutbound(supabase, tenant, policy, recorded.conversation?.id, lead.replyTextLog)
    return
  }
  if (lead.lead) await touch(supabase, tenant, event, "lead", matchRule?.id, lead.lead)

  if (event.channel !== "whatsapp" && content.mark_seen !== false && adapter.markSeen) {
    await adapter.markSeen(sendContext(tenant, event), event.messageId)
  }
  const sent = await sendTracked(supabase, adapter, tenant, policy, sendContext(tenant, event), content, event, {
    automationId: matchRule?.id,
    variantId,
  })
  await noteTikTokSend(supabase, tenant, event, sent)
  if (sent.ok) {
    await recordOutbound(supabase, tenant, policy, recorded.conversation?.id, previewOf(content))
    if (matchRule) {
      await logAutomationEvent(supabase, {
        user_id: tenant.userId,
        automation_id: matchRule.id,
        event_type: policy.outboundEventType,
        recipient_id: event.contactExternalId,
        platform: policy.eventPlatform,
        variant_id: variantId,
      })
    }
  }
}
