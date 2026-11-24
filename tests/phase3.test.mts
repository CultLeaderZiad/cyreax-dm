import type { NormalizedInbound } from "../lib/channels/types.ts"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { planInboundActions, matchCommentRule, matchDmRule } = await import("../lib/channels/match.ts")
const { evaluateMessagingWindow, commentReplyOpen, HUMAN_AGENT_WINDOW_MS, STANDARD_WINDOW_MS } = await import("../lib/channels/window.ts")
const { contactsToCsv, filterContacts, mergeContactTouch, normalizeTags } = await import("../lib/contacts.ts")
const { applyUrlMap, contentWithTrackedUrls, isPublicHttpUrl, shouldTrackUrl } = await import("../lib/channels/links.ts")
const { bucketByDay, buildFunnel, historyRole, tallyVariantEvents } = await import("../lib/analytics-metrics.ts")
const { deliverContent } = await import("../lib/channels/deliver.ts")
const { createInstagramAdapter, createMessengerAdapter, createTelegramAdapter, createWhatsAppAdapter, getAdapter } = await import("../lib/channels/adapters.ts")
const { normalizeInstagramBody, normalizeTelegramUpdate, normalizeWhatsAppBody } = await import("../lib/channels/normalize.ts")
const { commentTextsFromPayload } = await import("../lib/event-pipeline.ts")

const now = Date.parse("2026-09-30T12:00:00.000Z")

function rule(partial: any) {
  return {
    id: partial.id || "rule-1",
    name: partial.name || partial.id || "rule",
    trigger_source: partial.trigger_source,
    trigger_type: partial.trigger_type,
    trigger_value: partial.trigger_value ?? "",
    specific_media_id: partial.specific_media_id ?? null,
    response_content: partial.response_content || { message: "hello" },
    automation_variants: partial.automation_variants,
  }
}

describe("shared matcher", () => {
  const comments = [
    rule({ id: "post-all", trigger_source: "comment", trigger_type: "reply_all", specific_media_id: "post-1" }),
    rule({ id: "post-key", trigger_source: "comment", trigger_type: "keyword", trigger_value: "price", specific_media_id: "post-1" }),
    rule({ id: "global-key", trigger_source: "comment", trigger_type: "keyword", trigger_value: "price" }),
    rule({ id: "global-all", trigger_source: "comment", trigger_type: "reply_all" }),
  ]

  it("uses Instagram comment priority", () => {
    assert.equal(matchCommentRule(comments, { text: "price please", mediaId: "post-1", mode: "instagram" })?.id, "post-all")
    assert.equal(matchCommentRule(comments, { text: "hello", mediaId: "other", mode: "instagram" })?.id, "global-all")
    assert.equal(matchCommentRule(comments, { text: "what is the price", mediaId: "other", mode: "instagram" })?.id, "global-key")
  })

  it("uses Facebook comment priority and page-post ids", () => {
    const facebook = [
      rule({ id: "post-key", trigger_source: "comment", trigger_type: "keyword", trigger_value: "price", specific_media_id: "99" }),
      rule({ id: "post-all", trigger_source: "comment", trigger_type: "reply_all", specific_media_id: "99" }),
    ]
    assert.equal(matchCommentRule(facebook, { text: "price", mediaId: "10_99", mode: "facebook" })?.id, "post-key")
    assert.equal(matchCommentRule(facebook, { text: "hello", mediaId: "10_99", mode: "facebook" })?.id, "post-all")
  })

  it("does not give Instagram or WhatsApp a reply-all DM fallback", () => {
    const rules = [rule({ id: "all", trigger_source: "dm", trigger_type: "reply_all" })]
    assert.equal(matchDmRule(rules, { triggerType: "keyword", text: "hello", replyAll: false }), null)
    assert.equal(matchDmRule(rules, { triggerType: "keyword", text: "hello", replyAll: true })?.id, "all")
  })

  it("sends a story reply once, and still answers a DM when no story rule matches", () => {
    const story = rule({ id: "story", trigger_source: "story", trigger_type: "reply", trigger_value: "ALL" })
    const keyword = rule({ id: "dm", trigger_source: "dm", trigger_type: "keyword", trigger_value: "price" })
    const events: NormalizedInbound[] = [
      { channel: "instagram", kind: "story_reply", contactExternalId: "9", text: "price", groupId: "m1", mediaId: "story" },
      { channel: "instagram", kind: "dm", contactExternalId: "9", text: "price", groupId: "m1" },
    ]
    const matched = planInboundActions({ events, rules: [story, keyword], commentMatch: "instagram", dmReplyAll: false, now })
    assert.deepEqual(matched.map((action) => action.type), ["story", "skip_story_twin"])

    const unmatched = planInboundActions({ events, rules: [keyword], commentMatch: "instagram", dmReplyAll: false, now })
    assert.equal(unmatched.find((action) => action.type === "dm")?.type, "dm")
  })

  it("pauses the bot, drops own comments, and skips stale or nested comments", () => {
    const rules = [rule({ id: "all", trigger_source: "comment", trigger_type: "reply_all" })]
    const paused = planInboundActions({
      events: [{ channel: "instagram", kind: "dm", contactExternalId: "9", text: "hi" }],
      rules,
      commentMatch: "instagram",
      dmReplyAll: false,
      pausedIds: new Set(["9"]),
      now,
    })
    assert.equal(paused[0].type, "skip_paused")

    const own = planInboundActions({
      events: [{ channel: "instagram", kind: "comment", contactExternalId: "page", text: "hi" }],
      rules,
      commentMatch: "instagram",
      dmReplyAll: false,
      ownIds: new Set(["page"]),
      now,
    })
    assert.equal(own[0].type, "skip_own")

    const stale = planInboundActions({
      events: [{ channel: "instagram", kind: "comment", contactExternalId: "9", text: "hi", occurredAtMs: now - 8 * 24 * 60 * 60 * 1000 }],
      rules,
      commentMatch: "instagram",
      dmReplyAll: false,
      now,
    })
    assert.equal(stale[0].type, "skip_stale_comment")
    assert.equal(commentReplyOpen(now - 1000, now), true)

    const nested = planInboundActions({
      events: [{ channel: "instagram", kind: "comment", contactExternalId: "9", text: "hi", parentId: "parent" }],
      rules,
      commentMatch: "instagram",
      dmReplyAll: false,
      now,
    })
    assert.equal(nested[0].type, "skip_nested")
  })

  it("normalizes a WhatsApp button reply and a Telegram callback without a second DM", () => {
    const whatsapp = normalizeWhatsAppBody({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "555" }, messages: [{ id: "w1", from: "20100", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "BUY" } } }] } }] }],
    })
    assert.equal(whatsapp[0].kind, "postback")
    assert.equal(whatsapp[0].text, "BUY")
    assert.equal(whatsapp[0].accountRef, "555")

    const telegram = normalizeTelegramUpdate({ callback_query: { id: "c1", data: "BUY", from: { id: 7 }, message: { message_id: 3, chat: { id: 7 } } } })
    assert.equal(telegram.length, 1)
    assert.equal(telegram[0].kind, "postback")
  })
})

describe("messaging window", () => {
  it("allows a fresh reply, tags Human Agent inside 7 days, and blocks after that", () => {
    const fresh = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      lastInboundAt: new Date(now - 60_000).toISOString(),
      now,
    })
    assert.equal(fresh.status, "open")
    assert.equal(fresh.flagged, false)
    assert.equal(fresh.messagingType, "RESPONSE")

    const tagged = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      lastInboundAt: now - 25 * 60 * 60 * 1000,
      now,
    })
    assert.equal(tagged.status, "human_agent")
    assert.equal(tagged.flagged, true)
    assert.equal(tagged.tag, "HUMAN_AGENT")

    const closed = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      lastInboundAt: now - HUMAN_AGENT_WINDOW_MS - 1000,
      now,
    })
    assert.equal(closed.status, "closed")
    assert.equal(closed.reason, "outside_window")
  })

  it("blocks WhatsApp outside 24 hours and never windows Telegram", () => {
    const whatsapp = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: false,
      lastInboundAt: now - 25 * 60 * 60 * 1000,
      now,
    })
    assert.equal(whatsapp.status, "closed")

    const missing = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      lastInboundAt: null,
      now,
    })
    assert.equal(missing.reason, "no_inbound")

    const telegram = evaluateMessagingWindow({
      windowMs: null,
      supportsHumanAgent: false,
      lastInboundAt: null,
      now,
    })
    assert.equal(telegram.status, "not_applicable")
    assert.equal(telegram.flagged, false)
  })

  it("treats the webhook that just arrived as inside the window", () => {
    const verdict = evaluateMessagingWindow({
      windowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      lastInboundAt: null,
      now,
      inboundJustNow: true,
    })
    assert.equal(verdict.status, "open")
  })
})

describe("channel adapters", () => {
  function mockFetch(payload: any) {
    const calls: any[] = []
    const fetchImpl = async (url: any, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, headers: init?.headers })
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    return { fetchImpl, calls }
  }

  it("sends Instagram text and a Human Agent tag without messaging_type on a normal reply", async () => {
    const { fetchImpl, calls } = mockFetch({ message_id: "m1" })
    const adapter = createInstagramAdapter(fetchImpl)
    await adapter.sendText({ accessToken: "ig-token" }, "hello")
    assert.equal(calls[0].body.messaging_type, undefined)
    assert.match(calls[0].url, /graph\.instagram\.com/)
    const tagged = await adapter.sendText({ accessToken: "ig-token", tag: "HUMAN_AGENT", messagingType: "MESSAGE_TAG" }, "later")
    assert.equal(tagged.ok, true)
    assert.equal(calls[1].body.tag, "HUMAN_AGENT")
    assert.equal(calls[1].body.messaging_type, "MESSAGE_TAG")
  })

  it("requires messaging_type on Messenger and posts comment replies", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "fb1" })
    const adapter = createMessengerAdapter(fetchImpl)
    await adapter.sendText({ accessToken: "page" }, "hi")
    assert.equal(calls[0].body.messaging_type, "RESPONSE")
    await adapter.publicReply!({ accessToken: "page" }, "comment-1", "thanks")
    assert.match(calls[1].url, /comment-1\/comments/)
  })

  it("sends WhatsApp interactive replies and reports the 24-hour error", async () => {
    const calls: any[] = []
    const fetchImpl = async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers })
      const body = calls.length === 1 ? { messages: [{ id: "w1" }] } : { error: { code: 131047, message: "Re-engagement" } }
      return new Response(JSON.stringify(body), { status: 200 })
    }
    const adapter = createWhatsAppAdapter(fetchImpl)
    const ok = await adapter.sendText(
      { accessToken: "wa", senderRef: "555", recipientId: "20100" },
      "hello",
      [{ title: "Buy", payload: "BUY" }],
    )
    assert.equal(ok.id, "w1")
    assert.equal(calls[0].body.type, "interactive")
    assert.equal(calls[0].headers.Authorization, "Bearer wa")
    const blocked = await adapter.sendText({ accessToken: "wa", senderRef: "555", recipientId: "20100" }, "again")
    assert.equal(blocked.outsideWindow, true)
    assert.equal(blocked.ok, false)
  })

  it("sends a Telegram card as a photo with an inline keyboard", async () => {
    const { fetchImpl, calls } = mockFetch({ ok: true, result: { message_id: 9 } })
    const adapter = createTelegramAdapter(fetchImpl)
    const result = await adapter.sendCard(
      { accessToken: "123:abc", recipientId: "7" },
      { title: "Offer", image_url: "https://cdn.example/a.jpg", buttons: [{ type: "web_url", title: "Open", url: "https://example.com" }] },
    )
    assert.equal(result.ok, true)
    assert.match(calls[0].url, /bot123:abc\/sendPhoto/)
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].url, "https://example.com")
    assert.equal(getAdapter("tiktok")?.channel, "tiktok")
    assert.equal(getAdapter("not-a-channel"), null)
    assert.equal(getAdapter("telegram")?.messagingWindowMs, null)
  })
})

describe("outbound delivery", () => {
  it("turns an Instagram comment card into a quick reply and appends Messenger links", async () => {
    const calls: any[] = []
    // Minimal fake adapter: only what deliverContent touches.
    const adapter: any = {
      channel: "instagram",
      messagingWindowMs: STANDARD_WINDOW_MS,
      supportsHumanAgent: true,
      async sendText() { return { ok: true } },
      async sendCard() { return { ok: true } },
      async sendMedia() { return { ok: true } },
      async privateReply(_ctx: any, text: any, replies: any) {
        calls.push({ text, replies })
        return { ok: true, id: "p1" }
      },
    }
    await deliverContent(adapter, { accessToken: "t", commentId: "c1" }, {
      message: "Here",
      card: { title: "Link", buttons: [{ type: "web_url", title: "Open", url: "https://example.com/a" }] },
    }, { privateComment: true, privateReplyStyle: "instagram_card", automationId: "rule-9", variantId: null })
    assert.equal(calls[0].replies[0].payload, "SYS_CARD_rule-9_default")

    const messenger: any = {
      ...adapter,
      async privateReply(_ctx: any, text: any) {
        calls.push({ text })
        return { ok: true }
      },
    }
    await deliverContent(messenger, { accessToken: "t", commentId: "c1" }, {
      card: { title: "Link", buttons: [{ type: "web_url", title: "Open", url: "https://example.com/a" }] },
    }, { privateComment: true, privateReplyStyle: "append_links" })
    assert.match(calls[1].text, /https:\/\/example.com\/a/)
  })
})

describe("contacts", () => {
  const existing = {
    id: "c1",
    user_id: 10,
    channel: "instagram",
    external_id: "9",
    display_name: "Nour",
    tags: ["vip"],
    custom_fields: { city: "Cairo" },
    source: "comment",
    source_automation_id: "rule-1",
    first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: "2026-09-01T00:00:00.000Z",
    last_inbound_at: "2026-09-01T00:00:00.000Z",
    bot_paused: true,
    email: null,
    phone: null,
  }

  it("keeps the first seen time, tags, and pause when the person messages again", () => {
    const next = mergeContactTouch(existing, {
      userId: 10,
      channel: "instagram",
      externalId: "9",
      source: "dm",
      email: "nour@example.com",
      inboundAt: "2026-09-30T00:00:00.000Z",
    }, "2026-09-30T00:00:00.000Z")
    assert.equal(next.first_seen_at, existing.first_seen_at)
    assert.equal(next.source, "comment")
    assert.equal(next.bot_paused, true)
    assert.deepEqual(next.tags, ["vip"])
    assert.equal(next.email, "nour@example.com")
    assert.equal(next.last_inbound_at, "2026-09-30T00:00:00.000Z")
  })

  it("filters by tag and search, and escapes CSV cells", () => {
    const other = { ...existing, id: "c2", external_id: "2", display_name: "Ali", tags: ["new"], email: "ali@example.com", bot_paused: false }
    const found = filterContacts([existing, other], { query: "cairo", tag: "vip" })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, "c1")
    assert.equal(filterContacts([existing, other], { tag: "missing" }).length, 0)
    const csv = contactsToCsv([{ ...existing, display_name: 'Nour "N"' }])
    assert.match(csv, /"Nour ""N"""/)
    assert.match(csv, /vip/)
    assert.deepEqual(normalizeTags([" VIP ", "vip", "", 3]), ["VIP"])
  })
})

describe("click tracking and honest metrics", () => {
  it("rewrites public urls and refuses unsafe targets", () => {
    assert.equal(isPublicHttpUrl("javascript:alert(1)"), false)
    assert.equal(isPublicHttpUrl("https://user:pass@example.com"), false)
    assert.equal(shouldTrackUrl("https://app.example/r/abc", "https://app.example"), false)
    const map = new Map([["https://shop.example/item", "https://app.example/r/abc"]])
    const content = contentWithTrackedUrls({
      message: "Buy https://shop.example/item today",
      card: { title: "Card", buttons: [{ type: "web_url", title: "Open", url: "https://shop.example/item" }] },
    }, map)
    assert.match(content.message!, /\/r\/abc/)
    assert.equal(content.card!.buttons![0].url, "https://app.example/r/abc")
    assert.equal(applyUrlMap("see https://shop.example/item.", map), "see https://app.example/r/abc.")
  })

  it("counts leads and link clicks instead of calling every conversation a conversion", () => {
    const funnel = buildFunnel({ triggered: 4, sent: 3, replied: 2, linkClicked: 1, leads: 1 })
    assert.equal(funnel.leads, 1)
    assert.equal(funnel.link_clicked, 1)
    assert.equal("converted" in funnel, false)
    const variants = tallyVariantEvents([
      { variant_id: "v1", event_type: "dm_reply" },
      { variant_id: "v1", event_type: "link_click" },
      { variant_id: "v1", event_type: "dm_reply" },
    ])
    assert.equal(variants[0].sent, 2)
    assert.equal(variants[0].linkClicks, 1)
  })

  it("reads comment text from Instagram and Facebook payloads", () => {
    const texts = commentTextsFromPayload({
      entry: [{ changes: [{ value: { text: "price?" } }, { value: { message: "how much" } }] }],
    })
    assert.deepEqual(texts, ["price?", "how much"])
  })

  it("treats direction as the inbound signal for AI history", () => {
    assert.equal(historyRole({ direction: "in", is_from_instagram: false }), "user")
    assert.equal(historyRole({ direction: "out", is_from_instagram: true }), "assistant")
    assert.equal(historyRole({ is_from_instagram: true }), "user")
  })

  it("buckets a day of sends", () => {
    const days = bucketByDay([{ at: "2026-09-30T01:00:00.000Z", kind: "sent" }, { at: "2026-09-30T02:00:00.000Z", kind: "click" }], 2, now)
    assert.equal(days.at(-1)!.sent, 1)
    assert.equal(days.at(-1)!.linkClicks, 1)
    assert.equal(days[0].sent, 0)
  })
})

describe("instagram normalization", () => {
  it("keeps a story reply and its DM twin in one group", () => {
    const events = normalizeInstagramBody({
      object: "instagram",
      entry: [{
        id: "1789",
        messaging: [{
          sender: { id: "9" },
          recipient: { id: "1789" },
          message: { mid: "m1", text: "price", reply_to: { story: { id: "story-1" } } },
        }],
      }],
    })
    assert.equal(events.length, 2)
    assert.equal(events[0].kind, "story_reply")
    assert.equal(events[1].kind, "dm")
    assert.equal(events[0].groupId, events[1].groupId)
    assert.equal(events[0].accountRef, "1789")
  })
})
