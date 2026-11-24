import type { FlowGraph } from "../lib/flows/types.ts"

/** The first effect of a type; fails the test (instead of returning undefined) when absent. */
function effectOf(result: { effects: Array<{ type: string }> }, type: string): any {
  const found = result.effects.find((effect) => effect.type === type)
  if (!found) throw new Error(`no ${type} effect in ${JSON.stringify(result.effects)}`)
  return found
}
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { applyIncoming, initialStepToken, signalAccepted, delayIdempotencyKey } = await import("../lib/flows/engine.ts")
const { evaluateBroadcastCompliance } = await import("../lib/flows/policy.ts")
const { automationToFlow, planAutomationMigration } = await import("../lib/flows/migrate.ts")
const { triggerMatches } = await import("../lib/flows/match.ts")
const { enqueueJob, claimDueJobs, contactMatchesSegment, nextRecipientStatus, planBroadcast, rollupBroadcast } = await import("../lib/broadcasts/plan.ts")
const { enrollContact, dueStep, markStepSent, cancelEnrollment } = await import("../lib/broadcasts/sequence.ts")
const { isOptOutText } = await import("../lib/flows/opt-out.ts")
const { buildRefLink, addGiveawayEntry, pickWinners, commentToDmFlow, normalizeLead } = await import("../lib/growth/tools.ts")
const { HUMAN_AGENT_WINDOW_MS, STANDARD_WINDOW_MS } = await import("../lib/channels/window.ts")

const NOW = Date.parse("2026-09-30T12:00:00.000Z")

function contact(overrides: Record<string, any> = {}): any {
  return {
    channel: "instagram",
    externalId: "user-1",
    tags: [],
    customFields: {},
    botPaused: false,
    optedIn: false,
    optedOut: false,
    isFollower: null,
    lastInboundAt: new Date(NOW).toISOString(),
    ...overrides,
  }
}

function run(overrides: Record<string, any> = {}): any {
  const id = overrides.id || "run-1"
  return {
    id,
    flowId: "flow-1",
    versionId: "ver-1",
    contactExternalId: "user-1",
    channel: "instagram",
    status: "active",
    currentNodeId: null,
    waitKind: null,
    resumeAt: null,
    expectedPayloads: [],
    stepToken: initialStepToken(id),
    steps: 0,
    context: {},
    ...overrides,
  }
}

function edge(source: any, target: any, handle = "default") {
  return { id: `${source}-${target}-${handle}`, source, target, sourceHandle: handle }
}

describe("flow engine branching", () => {
  const graph: FlowGraph = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { trigger: { type: "keyword_dm" } } },
      { id: "check", type: "condition", position: { x: 0, y: 0 }, data: { match: "all", clauses: [{ type: "tag", tag: "vip", present: true }] } },
      { id: "yes", type: "send_message", position: { x: 0, y: 0 }, data: { text: "welcome vip", waitFor: "none" } },
      { id: "no", type: "send_message", position: { x: 0, y: 0 }, data: { text: "hello", waitFor: "none" } },
    ],
    edges: [edge("trigger", "check"), edge("check", "yes", "yes"), edge("check", "no", "no")],
  }

  it("follows the yes branch when the tag is present and the no branch otherwise", () => {
    const vip = applyIncoming({
      graph,
      run: run(),
      contact: contact({ tags: ["VIP"] }),
      signal: { kind: "start", eventId: "e1", text: "hi", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(vip, "send").content.message, "welcome vip")

    const guest = applyIncoming({
      graph,
      run: run({ id: "run-2" }),
      contact: contact(),
      signal: { kind: "start", eventId: "e2", text: "hi", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(guest, "send").content.message, "hello")
  })

  it("branches on channel and follower status", () => {
    const follower: FlowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
        { id: "check", type: "condition", position: { x: 0, y: 0 }, data: { match: "all", clauses: [{ type: "channel", channel: "instagram" }, { type: "follower", isFollower: true }] } },
        { id: "yes", type: "send_message", position: { x: 0, y: 0 }, data: { text: "follower", waitFor: "none" } },
        { id: "no", type: "send_message", position: { x: 0, y: 0 }, data: { text: "unknown", waitFor: "none" } },
      ],
      edges: [edge("trigger", "check"), edge("check", "yes", "yes"), edge("check", "no", "no")],
    }
    const unknown = applyIncoming({
      graph: follower,
      run: run(),
      contact: contact({ isFollower: null }),
      signal: { kind: "start", eventId: "e", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(unknown, "send").content.message, "unknown")
    const yes = applyIncoming({
      graph: follower,
      run: run({ id: "run-f" }),
      contact: contact({ isFollower: true }),
      signal: { kind: "start", eventId: "e", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(yes, "send").content.message, "follower")
  })
})

describe("flow engine delays, resume, and idempotency", () => {
  const graph: FlowGraph = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "hello", type: "send_message", position: { x: 0, y: 0 }, data: { text: "hello", waitFor: "none" } },
      { id: "wait", type: "smart_delay", position: { x: 0, y: 0 }, data: { delayMs: 2 * 60 * 60 * 1000, respectWindow: true, skipIfReplied: true } },
      { id: "later", type: "send_message", position: { x: 0, y: 0 }, data: { text: "still there?", waitFor: "none" } },
    ],
    edges: [edge("trigger", "hello"), edge("hello", "wait"), edge("wait", "later")],
  }

  it("sends the first message, schedules the delay, and does not send the follow-up yet", () => {
    const started = applyIncoming({
      graph,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "m1", text: "price", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(started, "send").content.message, "hello")
    assert.equal(started.effects.some((effect) => effect.type === "send" && effect.content.message === "still there?"), false)
    const scheduled = effectOf(started, "schedule")
    assert.equal(scheduled.resumeAt, NOW + 2 * 60 * 60 * 1000)
    assert.equal(started.run.status, "waiting")
    assert.equal(started.run.waitKind, "delay")
    assert.equal(delayIdempotencyKey(started.run.id, "wait"), "delay:run-1:wait")
  })

  it("resumes the follow-up once, and a second delivery of the same token does not send again", () => {
    const started = applyIncoming({
      graph,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "m1", inboundJustNow: true },
      now: NOW,
    })
    const token = effectOf(started, "schedule").stepToken
    assert.equal(signalAccepted(started.run.stepToken, token), true)
    const resumed = applyIncoming({
      graph,
      run: started.run,
      contact: contact(),
      signal: { kind: "delay", eventId: "delay:run-1:wait", inboundJustNow: false },
      expectedStepToken: token,
      now: NOW + 2 * 60 * 60 * 1000,
    })
    assert.equal(resumed.stale, false)
    assert.equal(effectOf(resumed, "send").content.message, "still there?")
    const again = applyIncoming({
      graph,
      run: resumed.run,
      contact: contact(),
      signal: { kind: "delay", eventId: "delay:run-1:wait" },
      expectedStepToken: token,
      now: NOW + 2 * 60 * 60 * 1000,
    })
    assert.equal(again.stale, true)
    assert.equal(again.effects.length, 0)
  })

  it("skips the follow-up when the contact replies during the delay", () => {
    const started = applyIncoming({
      graph,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "m1", inboundJustNow: true },
      now: NOW,
    })
    const token = started.run.stepToken
    const replied = applyIncoming({
      graph,
      run: started.run,
      contact: contact(),
      signal: { kind: "reply", eventId: "m2", text: "thanks" },
      expectedStepToken: token,
      now: NOW + 60_000,
    })
    assert.equal(replied.run.status, "completed")
    assert.equal(replied.effects.some((effect) => effect.type === "send"), false)
    const late = applyIncoming({
      graph,
      run: replied.run,
      contact: contact(),
      signal: { kind: "delay", eventId: "delay" },
      expectedStepToken: token,
      now: NOW + 2 * 60 * 60 * 1000,
    })
    assert.equal(late.stale, true)
  })

  it("resumes on the button edge and counts the click once", () => {
    const buttons: FlowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
        { id: "ask", type: "send_message", position: { x: 0, y: 0 }, data: { text: "Size?", buttons: [{ title: "M", payload: "SIZE_M" }], waitFor: "button" } },
        { id: "medium", type: "send_message", position: { x: 0, y: 0 }, data: { text: "Medium is in stock", waitFor: "none" } },
      ],
      edges: [edge("trigger", "ask"), edge("ask", "medium", "SIZE_M")],
    }
    const started = applyIncoming({
      graph: buttons,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "m1", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(started.run.waitKind, "button")
    const clicked = applyIncoming({
      graph: buttons,
      run: started.run,
      contact: contact(),
      signal: { kind: "button", eventId: "m2", payload: "SIZE_M" },
      expectedStepToken: started.run.stepToken,
      now: NOW + 1000,
    })
    assert.equal(clicked.effects.some((effect) => effect.type === "stat" && effect.stat === "click"), true)
    assert.equal(effectOf(clicked, "send").content.message, "Medium is in stock")
    const duplicate = applyIncoming({
      graph: buttons,
      run: clicked.run,
      contact: contact(),
      signal: { kind: "button", eventId: "m2", payload: "SIZE_M" },
      expectedStepToken: started.run.stepToken,
      now: NOW + 1000,
    })
    assert.equal(duplicate.stale, true)
  })

  it("ignores a duplicate queue row", () => {
    const job: any = {
      idempotencyKey: "start:flow:user:m1",
      kind: "start",
      contactExternalId: "user",
      channel: "instagram",
      payload: {},
      status: "pending",
      attempts: 0,
      nextAttemptAt: NOW,
      lockedAt: null,
    }
    const first = enqueueJob([], job)
    const second = enqueueJob(first.jobs, job)
    assert.equal(second.duplicate, true)
    assert.equal(second.jobs.length, 1)
    const claimed = claimDueJobs(second.jobs, NOW, 5)
    assert.equal(claimed.claimed.length, 1)
    const again = claimDueJobs(claimed.jobs, NOW, 5)
    assert.equal(again.claimed.length, 0)
  })
})

describe("flow window rules and pause", () => {
  const graph: FlowGraph = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
      { id: "send", type: "send_message", position: { x: 0, y: 0 }, data: { text: "ping", waitFor: "none" } },
    ],
    edges: [edge("trigger", "send")],
  }

  function proactive(channel: any, lastInboundAt: any, extra: { templateApproved?: boolean; templateName?: string } = {}) {
    const waiting = run({
      id: "run-w",
      channel,
      status: "waiting",
      waitKind: "delay",
      currentNodeId: "wait",
      stepToken: "run-w:wait:1",
    })
    const withDelay: FlowGraph = {
      nodes: [
        { id: "wait", type: "smart_delay", position: { x: 0, y: 0 }, data: { delayMs: 1000, respectWindow: false, skipIfReplied: false } },
        { id: "send", type: "send_message", position: { x: 0, y: 0 }, data: { text: "ping", waitFor: "none", ...extra } },
      ],
      edges: [edge("wait", "send")],
    }
    return applyIncoming({
      graph: withDelay,
      run: waiting,
      contact: contact({ channel, lastInboundAt }),
      signal: { kind: "delay", eventId: "d1", inboundJustNow: false },
      expectedStepToken: waiting.stepToken,
      now: NOW,
      templateApproved: extra.templateApproved === true,
    })
  }

  it("allows an Instagram reply inside 24h and uses the human agent tag through 7 days", () => {
    const open = applyIncoming({
      graph,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "e", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(open, "send").messagingType, "RESPONSE")

    const human = proactive("instagram", new Date(NOW - STANDARD_WINDOW_MS - 60_000).toISOString())
    const sent = effectOf(human, "send")
    assert.equal(sent.tag, "HUMAN_AGENT")

    const closed = proactive("instagram", new Date(NOW - HUMAN_AGENT_WINDOW_MS - 60_000).toISOString())
    assert.equal(closed.effects.some((effect) => effect.type === "send"), false)
    assert.equal(effectOf(closed, "blocked").reason, "outside_window")
  })

  it("blocks WhatsApp outside 24h unless an approved template is going to an opted-in contact", () => {
    const blocked = proactive("whatsapp", new Date(NOW - STANDARD_WINDOW_MS - 1000).toISOString())
    assert.equal(effectOf(blocked, "blocked").reason, "whatsapp_template_required")
    const allowed = proactive("whatsapp", new Date(NOW - STANDARD_WINDOW_MS - 1000).toISOString(), {
      templateName: "order_update",
      templateApproved: true,
    })
    const opted = applyIncoming({
      graph: allowed.run ? {
        nodes: [
          { id: "wait", type: "smart_delay", position: { x: 0, y: 0 }, data: { delayMs: 1000, respectWindow: false, skipIfReplied: false } },
          { id: "send", type: "send_message", position: { x: 0, y: 0 }, data: { text: "ping", templateName: "order_update", waitFor: "none" } },
        ],
        edges: [edge("wait", "send")],
      } : graph,
      run: run({ id: "run-w", channel: "whatsapp", status: "waiting", waitKind: "delay", currentNodeId: "wait", stepToken: "run-w:wait:1" }),
      contact: contact({ channel: "whatsapp", optedIn: true, lastInboundAt: new Date(NOW - STANDARD_WINDOW_MS - 1000).toISOString() }),
      signal: { kind: "delay", eventId: "d", inboundJustNow: false },
      expectedStepToken: "run-w:wait:1",
      now: NOW,
      templateApproved: true,
    })
    assert.equal(opted.effects.some((effect) => effect.type === "send"), true)
  })

  it("lets Telegram send with no window and holds a paused bot", () => {
    const telegram = proactive("telegram", null)
    assert.equal(telegram.effects.some((effect) => effect.type === "send"), true)
    const paused = applyIncoming({
      graph,
      run: run(),
      contact: contact({ botPaused: true }),
      signal: { kind: "start", eventId: "e", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(paused.run.status, "paused")
    assert.equal(paused.effects.some((effect) => effect.type === "send"), false)
  })

  it("stops a jump loop", () => {
    const loop: FlowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} },
        { id: "a", type: "jump", position: { x: 0, y: 0 }, data: { targetId: "b" } },
        { id: "b", type: "jump", position: { x: 0, y: 0 }, data: { targetId: "a" } },
      ],
      edges: [edge("trigger", "a")],
    }
    const result = applyIncoming({
      graph: loop,
      run: run(),
      contact: contact(),
      signal: { kind: "start", eventId: "e", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(result.run.status, "failed")
    assert.equal(result.run.context.error, "step_limit")
  })
})

describe("broadcast compliance", () => {
  const base = { now: NOW, lastInboundAt: new Date(NOW).toISOString(), optedIn: false, optedOut: false }

  it("requires an approved WhatsApp template and opt-in, even inside the window", () => {
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "whatsapp" }).reason, "whatsapp_not_opted_in")
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "whatsapp", optedIn: true }).reason, "whatsapp_template_required")
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "whatsapp", optedIn: true, templateName: "promo", templateApproved: false }).reason, "whatsapp_template_not_approved")
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "whatsapp", optedIn: true, templateName: "promo", templateApproved: true, lastInboundAt: null }).allowed, true)
  })

  it("keeps Instagram and Messenger inside the window unless a valid tag is set", () => {
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "instagram" }).allowed, true)
    const outside = { ...base, channel: "messenger", lastInboundAt: new Date(NOW - STANDARD_WINDOW_MS - 1000).toISOString() }
    assert.equal(evaluateBroadcastCompliance(outside).reason, "tag_required")
    assert.equal(evaluateBroadcastCompliance({ ...outside, messageTag: "NOT_A_TAG" }).reason, "invalid_tag")
    assert.equal(evaluateBroadcastCompliance({ ...outside, messageTag: "HUMAN_AGENT" }).tag, "HUMAN_AGENT")
    for (const retired of ["ACCOUNT_UPDATE", "POST_PURCHASE_UPDATE", "CONFIRMED_EVENT_UPDATE"]) {
      assert.equal(evaluateBroadcastCompliance({ ...outside, messageTag: retired }).reason, "invalid_tag")
    }
    const week = { ...outside, lastInboundAt: new Date(NOW - HUMAN_AGENT_WINDOW_MS - 1000).toISOString(), messageTag: "HUMAN_AGENT" }
    assert.equal(evaluateBroadcastCompliance(week).reason, "outside_window")
    assert.equal(evaluateBroadcastCompliance({ ...week, messageTag: "POST_PURCHASE_UPDATE" }).reason, "invalid_tag")
  })

  it("sends Telegram and website chat freely and skips opted-out contacts", () => {
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "telegram", lastInboundAt: null }).allowed, true)
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "webchat", lastInboundAt: null }).allowed, true)
    assert.equal(evaluateBroadcastCompliance({ ...base, channel: "telegram", optedOut: true }).reason, "opted_out")
  })

  it("matches a segment and spaces the queue", () => {
    const people: any[] = [
      { id: "1", channel: "instagram", externalId: "a", tags: ["vip"], customFields: { city: "Riyadh" }, optedIn: false, optedOut: false, lastInboundAt: new Date(NOW).toISOString() },
      { id: "2", channel: "instagram", externalId: "b", tags: ["new"], customFields: { city: "Cairo" }, optedIn: false, optedOut: false, lastInboundAt: new Date(NOW).toISOString() },
      { id: "3", channel: "telegram", externalId: "c", tags: ["vip"], customFields: {}, optedIn: false, optedOut: false, lastInboundAt: null },
    ]
    assert.equal(contactMatchesSegment(people[0], { tags: ["vip"], fields: [{ key: "city", op: "eq", value: "riyadh" }] }), true)
    assert.equal(contactMatchesSegment(people[1], { tags: ["vip"] }), false)
    assert.equal(contactMatchesSegment(people[0], {}), false)
    const plan = planBroadcast({
      broadcastId: "b1",
      channel: "instagram",
      contacts: people,
      segment: { tags: ["vip"], tagMode: "any" },
      now: NOW,
      perMinute: 30,
    }, () => ({ allowed: true }))
    assert.equal(plan.jobs.length, 1)
    assert.equal(plan.jobs[0].contactExternalId, "a")
    assert.equal(plan.jobs[0].nextAttemptAt, NOW)
    const blocked = planBroadcast({
      broadcastId: "b2",
      channel: "whatsapp",
      contacts: [{ ...people[0], channel: "whatsapp", externalId: "w", optedIn: false }],
      segment: { all: true },
      now: NOW,
      perMinute: 30,
    }, () => ({ allowed: false, reason: "whatsapp_not_opted_in" }))
    assert.equal(blocked.jobs.length, 0)
    assert.equal(blocked.skipped[0].reason, "whatsapp_not_opted_in")
    assert.equal(nextRecipientStatus("sent", "opened"), "opened")
    assert.equal(nextRecipientStatus("clicked", "opened"), "clicked")
    const rollup = rollupBroadcast(["sent", "opened", "clicked", "skipped"])
    assert.equal(rollup.sent, 3)
    assert.equal(rollup.opened, 2)
    assert.equal(rollup.clicked, 1)
    assert.equal(rollup.skipped, 1)
  })
})

describe("sequences and opt-out", () => {
  const steps = [
    { id: "s1", delayMs: 0, text: "one" },
    { id: "s2", delayMs: 86_400_000, text: "two" },
  ]

  it("enrolls, sends the due step, and stops on opt-out", () => {
    const enrollment = enrollContact({ id: "en-1", sequenceId: "seq", contactExternalId: "u", channel: "telegram", steps, now: NOW })
    assert.equal(dueStep(enrollment, steps, NOW)!.id, "s1")
    const next = markStepSent(enrollment, steps, NOW)
    assert.equal(next.stepIndex, 1)
    assert.equal(next.nextSendAt, NOW + 86_400_000)
    assert.equal(dueStep(next, steps, NOW), null)
    assert.equal(cancelEnrollment(next).status, "opted_out")
    assert.equal(isOptOutText(" STOP "), true)
    assert.equal(isOptOutText("إلغاء"), true)
    assert.equal(isOptOutText("hello"), false)
  })
})

describe("automation migration", () => {
  const rule = {
    id: "rule-1",
    name: "Price",
    platform: "instagram",
    trigger_source: "comment",
    trigger_type: "keyword",
    trigger_value: "price",
    specific_media_id: "reel-9",
    response_content: {
      message: "The serum is 120 SAR",
      public_replies: ["Check your DMs"],
      reply_mode: "both",
    },
    is_active: true,
  }

  it("turns a comment rule into a flow that sends the same text", () => {
    const flow = automationToFlow(rule)
    assert.equal(flow.trigger.type, "comment")
    assert.equal(flow.trigger.mediaId, "reel-9")
    assert.equal(triggerMatches(flow.trigger, {
      channel: "instagram",
      kind: "comment",
      text: "what is the price?",
      contactExternalId: "u",
      mediaId: "reel-9",
      commentId: "c1",
    }), true)
    assert.equal(triggerMatches(flow.trigger, {
      channel: "instagram",
      kind: "comment",
      text: "love this",
      contactExternalId: "u",
      mediaId: "reel-9",
    }), false)
    const result = applyIncoming({
      graph: flow.graph,
      run: run({ channel: flow.channel }),
      contact: contact(),
      signal: { kind: "start", eventId: "c1", text: "price", commentId: "c1", inboundJustNow: true },
      now: NOW,
      random: () => 0,
    })
    assert.equal(effectOf(result, "public_reply").text, "Check your DMs")
    assert.equal(effectOf(result, "send").content.message, "The serum is 120 SAR")
  })

  it("does not create a second flow for an automation that was already migrated", () => {
    const once = planAutomationMigration([rule, rule], new Set())
    assert.equal(once.length, 1)
    const twice = planAutomationMigration([rule], new Set(["rule-1"]))
    assert.equal(twice.length, 0)
  })

  it("keeps a keyword DM and a story mention", () => {
    const dm = automationToFlow({
      id: "dm-1",
      name: "Hi",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "hello",
      response_content: { message: "hey" },
    })
    assert.equal(dm.trigger.type, "keyword_dm")
    const sent = applyIncoming({
      graph: dm.graph,
      run: run({ id: "dm-run" }),
      contact: contact(),
      signal: { kind: "start", eventId: "m", text: "hello", inboundJustNow: true },
      now: NOW,
    })
    assert.equal(effectOf(sent, "send").content.message, "hey")
    const story = automationToFlow({
      id: "st-1",
      name: "Mention",
      trigger_source: "story",
      trigger_type: "mention",
      response_content: { message: "thanks for the mention" },
    })
    assert.equal(story.trigger.type, "story_mention")
  })
})

describe("growth tools", () => {
  it("builds comment-to-DM, ref links, leads, and a stable winner list", () => {
    const flow = commentToDmFlow({ templateId: "price", mediaId: "reel-1" })!
    assert.equal(flow.trigger.keywords, "PRICE")
    assert.equal(flow.trigger.mediaId, "reel-1")
    assert.equal(flow.graph.nodes.some((node) => node.type === "public_reply"), true)

    const ig = buildRefLink({ channel: "instagram", handle: "@nour", code: "PRICE" })
    assert.equal(ig.ok && ig.url, "https://ig.me/m/nour?ref=PRICE")
    const wa = buildRefLink({ channel: "whatsapp", handle: "+971 50 000 0000", code: "PRICE" })
    assert.equal(wa.ok && wa.url, "https://wa.me/971500000000?text=PRICE")
    const tg = buildRefLink({ channel: "telegram", handle: "helixa_bot", code: "PRICE" })
    assert.equal(tg.ok && tg.url, "https://t.me/helixa_bot?start=PRICE")
    const me = buildRefLink({ channel: "messenger", handle: "nourcosmetics", code: "PRICE" })
    assert.equal(me.ok && me.url, "https://m.me/nourcosmetics?ref=PRICE")
    assert.equal(buildRefLink({ channel: "instagram", handle: "nour", code: "bad code" }).ok, false)

    assert.equal(normalizeLead({ email: "a@b.com" }).ok, true)
    assert.equal(normalizeLead({ phone: "123" }).ok, false)
    assert.equal(normalizeLead({}).ok, false)

    const first = addGiveawayEntry([], "u1", NOW)
    const second = addGiveawayEntry(first.entries, "u1", NOW + 1)
    assert.equal(second.added, false)
    const third = addGiveawayEntry(second.entries, "u2", NOW)
    const winners = pickWinners(third.entries.map((entry) => entry.contactId), 1, "seed-a")
    assert.deepEqual(winners, pickWinners(["u1", "u2"], 1, "seed-a"))
    assert.notDeepEqual(winners, pickWinners(["u1", "u2"], 1, "seed-b"))
  })

  it("matches a ref and a TikTok DM only when messaging is enabled", () => {
    assert.equal(triggerMatches({ type: "ref", channel: "telegram", refCode: "PRICE" }, {
      channel: "telegram",
      kind: "dm",
      text: "/start PRICE",
      contactExternalId: "1",
    }), true)
    assert.equal(triggerMatches({ type: "tiktok_dm", keywords: "price" }, {
      channel: "tiktok",
      kind: "dm",
      text: "price please",
      contactExternalId: "1",
    }, { tiktokEnabled: false }), false)
    assert.equal(triggerMatches({ type: "tiktok_dm", keywords: "price" }, {
      channel: "tiktok",
      kind: "dm",
      text: "price please",
      contactExternalId: "1",
    }, { tiktokEnabled: true }), true)
    assert.equal(triggerMatches({ type: "website_visitor", firstOnly: true }, {
      channel: "webchat",
      kind: "dm",
      text: "hi",
      contactExternalId: "1",
    }, { firstSeen: false }), false)
  })
})
