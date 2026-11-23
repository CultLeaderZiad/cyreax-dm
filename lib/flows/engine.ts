import type { OutboundButton, OutboundContent, QuickReply } from "@/lib/channels/types"
import { productsToContent, type CatalogProduct } from "@/lib/commerce/catalog"
import { channelCapabilities, fillTemplate, findNode, isSafeWebhookUrl, outgoing } from "@/lib/flows/graph"
import { isOptOutText } from "@/lib/flows/opt-out"
import { channelWindow, flowSendAllowed } from "@/lib/flows/policy"
import {
  MAX_FLOW_STEPS,
  type EngineResult,
  type FlowContact,
  type FlowEffect,
  type FlowGraph,
  type FlowNode,
  type FlowRunState,
  type FlowSignal,
  type SendEffect,
} from "@/lib/flows/types"

export interface EngineInput {
  graph: FlowGraph
  run: FlowRunState
  contact: FlowContact
  signal: FlowSignal
  now: number
  /** Token stored on the queue row. A second delivery of the same row does not advance. */
  expectedStepToken?: string | null
  deliveredNodeIds?: string[]
  random?: () => number
  tiktokEnabled?: boolean
  templateApproved?: boolean
  catalog?: CatalogProduct[]
}

export function initialStepToken(runId: string): string {
  return `${runId}:start`
}

export function signalAccepted(stepToken: string, expected: string | null | undefined): boolean {
  if (!expected) return false
  return stepToken === expected
}

export function startIdempotencyKey(flowId: string, externalId: string, eventId: string): string {
  return `start:${flowId}:${externalId}:${eventId}`
}

export function resumeIdempotencyKey(runId: string, nodeId: string, eventId: string): string {
  return `resume:${runId}:${nodeId}:${eventId}`
}

export function delayIdempotencyKey(runId: string, nodeId: string): string {
  return `delay:${runId}:${nodeId}`
}

interface Clause {
  type?: string
  tag?: string
  present?: boolean
  key?: string
  op?: string
  value?: string
  channel?: string
  isFollower?: boolean
}

export function conditionPasses(contact: FlowContact, data: Record<string, unknown>): boolean {
  const clauses = Array.isArray(data.clauses) ? (data.clauses as Clause[]) : []
  if (clauses.length === 0) return false
  const mode = data.match === "any" ? "any" : "all"
  const results = clauses.map((clause) => clausePasses(contact, clause))
  return mode === "any" ? results.some(Boolean) : results.every(Boolean)
}

function clausePasses(contact: FlowContact, clause: Clause): boolean {
  if (clause.type === "tag") {
    const has = contact.tags.some((tag) => tag.toLowerCase() === String(clause.tag || "").toLowerCase())
    return clause.present === false ? !has : has
  }
  if (clause.type === "field") {
    const value = contact.customFields[String(clause.key || "")]
    if (clause.op === "exists") return Boolean(value)
    if (value == null) return false
    const expected = String(clause.value || "")
    if (clause.op === "neq") return value.toLowerCase() !== expected.toLowerCase()
    if (clause.op === "contains") return value.toLowerCase().includes(expected.toLowerCase())
    return value.toLowerCase() === expected.toLowerCase()
  }
  if (clause.type === "channel") return contact.channel === clause.channel
  if (clause.type === "follower") {
    if (contact.isFollower == null) return false
    return contact.isFollower === (clause.isFollower !== false)
  }
  return false
}

export function smartResumeAt(input: {
  now: number
  delayMs: number
  lastInboundAt: string | null
  windowMs: number | null
  respectWindow: boolean
}): { resumeAt: number; skip: boolean } {
  const target = input.now + Math.max(0, input.delayMs)
  if (!input.respectWindow || input.windowMs == null) return { resumeAt: target, skip: false }
  const inbound = input.lastInboundAt ? Date.parse(input.lastInboundAt) : Number.NaN
  if (!Number.isFinite(inbound)) return { resumeAt: target, skip: true }
  const end = inbound + input.windowMs
  if (input.now >= end) return { resumeAt: input.now, skip: true }
  if (target < end) return { resumeAt: target, skip: false }
  const early = end - 1000
  if (early <= input.now) return { resumeAt: input.now, skip: true }
  return { resumeAt: early, skip: false }
}

function cloneContact(contact: FlowContact): FlowContact {
  return {
    ...contact,
    tags: [...contact.tags],
    customFields: { ...contact.customFields },
  }
}

function nextToken(run: FlowRunState, nodeId: string): string {
  return `${run.id}:${nodeId}:${run.steps}`
}

function asButtons(value: unknown): Array<{ title: string; payload: string; url?: string }> {
  if (!Array.isArray(value)) return []
  const buttons: Array<{ title: string; payload: string; url?: string }> = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as { title?: string; payload?: string; url?: string }
    const title = String(row.title || "").trim()
    if (!title) continue
    buttons.push({ title, payload: String(row.payload || title), url: row.url ? String(row.url) : undefined })
  }
  return buttons
}

function shapeContent(channel: string, data: Record<string, unknown>, contact: FlowContact, context: Record<string, string>): OutboundContent {
  const caps = channelCapabilities(channel)
  const text = fillTemplate(String(data.text || data.message || ""), contact, context)
  const content: OutboundContent = {}
  if (text) content.message = text
  if (caps.media && data.media && typeof data.media === "object") {
    const media = data.media as { type?: string; url?: string }
    if (media.url && /^https:\/\//i.test(media.url)) {
      const type = media.type === "video" || media.type === "audio" || media.type === "document" ? media.type : "image"
      content.media = { type, url: media.url }
    }
  }
  const buttons = caps.buttons ? asButtons(data.buttons).slice(0, Math.max(caps.maxButtons, 0)) : []
  const quick = caps.quickReplies ? asButtons(data.quickReplies) : []
  const urlButtons = buttons.filter((button) => button.url)
  const postbacks = buttons.filter((button) => !button.url)
  if (urlButtons.length) {
    const outbound: OutboundButton[] = buttons.map((button) =>
      button.url
        ? { type: "web_url", title: button.title, url: button.url }
        : { type: "postback", title: button.title, payload: button.payload },
    )
    content.card = { title: text || "Choose", buttons: outbound }
  } else {
    const replies: QuickReply[] = [...postbacks, ...quick].map((item) => ({ title: item.title, payload: item.payload }))
    if (replies.length) content.quick_replies = replies
  }
  return content
}

function pickText(variants: unknown, random: () => number): string {
  const pool = (Array.isArray(variants) ? variants : []).map((item) => String(item || "").trim()).filter(Boolean)
  if (pool.length === 0) return ""
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
  return pool[index] || ""
}

function emptyResult(run: FlowRunState, contact: FlowContact, stale = false): EngineResult {
  return { run, contact, effects: [], stale, hold: false, retryAt: null }
}

/**
 * Advance one flow run. The same queue delivery is a no-op once the step token
 * has moved. Waits stop the walk and return a schedule or a waiting run.
 */
export function applyIncoming(input: EngineInput): EngineResult {
  const contact = cloneContact(input.contact)
  const run: FlowRunState = {
    ...input.run,
    context: { ...input.run.context },
    expectedPayloads: [...input.run.expectedPayloads],
  }
  const random = input.random || (() => 0)
  const delivered = new Set(input.deliveredNodeIds || [])

  if (contact.optedOut || isOptOutText(input.signal.text) || isOptOutText(input.signal.payload)) {
    contact.optedOut = true
    run.status = "opted_out"
    run.waitKind = null
    run.stepToken = nextToken(run, run.currentNodeId || "optout")
    return { run, contact, effects: [], stale: false, hold: false, retryAt: null }
  }

  if (input.signal.kind !== "start" && !signalAccepted(run.stepToken, input.expectedStepToken)) {
    return emptyResult(run, contact, true)
  }

  if (input.signal.kind === "start") {
    const trigger = input.graph.nodes.find((node) => node.type === "trigger")
    if (!trigger) {
      run.status = "failed"
      run.context.error = "missing_trigger"
      return emptyResult(run, contact)
    }
    run.status = "active"
    run.currentNodeId = trigger.id
    run.waitKind = null
    run.resumeAt = null
    run.expectedPayloads = []
    run.steps = 0
    run.stepToken = initialStepToken(run.id)
    if (input.signal.commentId) run.context.commentId = input.signal.commentId
    if (input.signal.text) run.context.lastText = input.signal.text.slice(0, 500)
  } else if (run.status === "paused" && contact.botPaused) {
    return hold(run, contact, input.now + 60_000)
  } else if (run.status !== "waiting" && run.status !== "paused" && run.status !== "active") {
    return emptyResult(run, contact, true)
  } else {
    const opened = openWait(input.graph, run, input.signal, contact)
    if (opened.hold) return hold(run, contact, opened.retryAt || input.now + 60_000)
    if (opened.stale) return emptyResult(run, contact, true)
    if (opened.effects.length) {
      // click stat is recorded before the walk continues
    }
    return walk(input, run, contact, opened.effects, random, delivered, false)
  }

  if (contact.botPaused) {
    run.status = "paused"
    return emptyResult(run, contact)
  }

  return walk(input, run, contact, [], random, delivered, true)
}

function hold(run: FlowRunState, contact: FlowContact, retryAt: number): EngineResult {
  run.status = "paused"
  return { run, contact, effects: [], stale: false, hold: true, retryAt }
}

function openWait(
  graph: FlowGraph,
  run: FlowRunState,
  signal: FlowSignal,
  contact: FlowContact,
): { effects: FlowEffect[]; hold: boolean; stale: boolean; retryAt?: number } {
  const node = findNode(graph, run.currentNodeId)
  if (!node) return { effects: [], hold: false, stale: true }

  if (contact.botPaused) {
    run.status = "paused"
    return { effects: [], hold: true, stale: false, retryAt: undefined }
  }

  if (run.waitKind === "delay" && signal.kind === "reply") {
    const skip = node.data.skipIfReplied !== false
    if (!skip) return { effects: [], hold: false, stale: true }
    run.steps += 1
    run.stepToken = nextToken(run, node.id)
    run.waitKind = null
    run.status = "active"
    const replied = outgoing(graph, node.id, "replied")
    if (replied) run.currentNodeId = replied.target
    else run.status = "completed"
    return { effects: [], hold: false, stale: false }
  }

  if (run.waitKind === "delay" && signal.kind === "delay") {
    run.steps += 1
    run.stepToken = nextToken(run, node.id)
    run.waitKind = null
    run.resumeAt = null
    run.status = "active"
    const edge = outgoing(graph, node.id, "default")
    if (!edge) {
      run.status = "completed"
      return { effects: [], hold: false, stale: false }
    }
    run.currentNodeId = edge.target
    return { effects: [], hold: false, stale: false }
  }

  if (run.waitKind === "button" && signal.kind === "button") {
    const payload = signal.payload || signal.text || ""
    run.steps += 1
    const effects: FlowEffect[] = [{ type: "stat", nodeId: node.id, stat: "click" }]
    run.stepToken = nextToken(run, node.id)
    run.waitKind = null
    run.expectedPayloads = []
    run.status = "active"
    run.context.lastPayload = payload.slice(0, 200)
    const edge = outgoing(graph, node.id, payload) || outgoing(graph, node.id, "default")
    if (!edge) {
      run.status = "completed"
      return { effects, hold: false, stale: false }
    }
    run.currentNodeId = edge.target
    return { effects, hold: false, stale: false }
  }

  if (run.waitKind === "reply" && (signal.kind === "reply" || signal.kind === "button")) {
    run.steps += 1
    run.stepToken = nextToken(run, node.id)
    run.waitKind = null
    run.status = "active"
    if (signal.text) run.context.lastText = signal.text.slice(0, 500)
    const edge = outgoing(graph, node.id, "default")
    if (!edge) {
      run.status = "completed"
      return { effects: [], hold: false, stale: false }
    }
    run.currentNodeId = edge.target
    return { effects: [], hold: false, stale: false }
  }

  if (run.waitKind === "ai" && signal.kind === "ai" && signal.aiReply) {
    run.context[`ai:${node.id}`] = signal.aiReply.slice(0, 2000)
    if (signal.handoff) run.context[`handoff:${node.id}`] = "1"
    if (signal.captured && Object.keys(signal.captured).length) {
      run.context[`fields:${node.id}`] = JSON.stringify(signal.captured).slice(0, 2000)
    }
    run.steps += 1
    run.stepToken = nextToken(run, node.id)
    run.waitKind = null
    run.status = "active"
    return { effects: [], hold: false, stale: false }
  }

  return { effects: [], hold: false, stale: true }
}

function walk(
  input: EngineInput,
  run: FlowRunState,
  contact: FlowContact,
  effects: FlowEffect[],
  random: () => number,
  delivered: Set<string>,
  fromStart: boolean,
): EngineResult {
  const inboundJustNow = fromStart && input.signal.inboundJustNow !== false && input.signal.kind === "start"
  let guard = 0
  while (run.status === "active") {
    guard += 1
    run.steps += 1
    if (guard > MAX_FLOW_STEPS || run.steps > MAX_FLOW_STEPS) {
      run.status = "failed"
      run.context.error = "step_limit"
      break
    }
    const node = findNode(input.graph, run.currentNodeId)
    if (!node) {
      run.status = "completed"
      break
    }
    const outcome = execNode({
      graph: input.graph,
      node,
      run,
      contact,
      effects,
      random,
      delivered,
      now: input.now,
      inboundJustNow,
      tiktokEnabled: input.tiktokEnabled !== false,
      templateApproved: input.templateApproved === true,
      commentId: input.signal.commentId || run.context.commentId,
      catalog: input.catalog || [],
    })
    if (outcome === "hold") {
      return { run, contact, effects, stale: false, hold: true, retryAt: input.now + 60_000 }
    }
    if (outcome === "stop") break
  }
  return { run, contact, effects, stale: false, hold: false, retryAt: null }
}

function execNode(input: {
  graph: FlowGraph
  node: FlowNode
  run: FlowRunState
  contact: FlowContact
  effects: FlowEffect[]
  random: () => number
  delivered: Set<string>
  now: number
  inboundJustNow: boolean
  tiktokEnabled: boolean
  templateApproved: boolean
  commentId?: string
  catalog: CatalogProduct[]
}): "continue" | "stop" | "hold" {
  const { node, run, contact, effects, graph } = input
  const data = node.data || {}

  if (node.type === "trigger") return go(graph, run, node.id, "default")

  if (node.type === "condition") {
    const handle = conditionPasses(contact, data) ? "yes" : "no"
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, handle)
  }

  if (node.type === "add_tag" || node.type === "remove_tag") {
    const tags = asStringList(data.tags)
    if (node.type === "add_tag") contact.tags = mergeTags(contact.tags, tags)
    else contact.tags = contact.tags.filter((tag) => !tags.some((item) => item.toLowerCase() === tag.toLowerCase()))
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, "default")
  }

  if (node.type === "set_field") {
    const key = String(data.key || "").trim().slice(0, 40)
    const value = fillTemplate(String(data.value || ""), contact, run.context).slice(0, 500)
    if (key) {
      const fields = { ...contact.customFields, [key]: value }
      const names = Object.keys(fields)
      if (names.length > 30) delete fields[names[0]]
      contact.customFields = fields
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, "default")
  }

  if (node.type === "jump") {
    const target = String(data.targetId || "")
    if (!findNode(graph, target) || target === node.id) {
      run.status = "failed"
      run.context.error = "bad_jump"
      return "stop"
    }
    run.currentNodeId = target
    return "continue"
  }

  if (node.type === "handoff") {
    contact.botPaused = true
    effects.push({ type: "pause_bot", nodeId: node.id })
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    run.status = "completed"
    run.waitKind = null
    run.stepToken = nextToken(run, node.id)
    return "stop"
  }

  if (node.type === "webhook") {
    const url = String(data.url || "")
    if (!isSafeWebhookUrl(url)) {
      effects.push({ type: "blocked", nodeId: node.id, reason: "unsafe_webhook" })
    } else if (!input.delivered.has(node.id)) {
      const method = String(data.method || "POST").toUpperCase() === "GET" ? "GET" : "POST"
      const body = fillTemplate(String(data.body || ""), contact, run.context)
      effects.push({ type: "webhook", nodeId: node.id, url, method, body })
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, "default")
  }

  if (node.type === "smart_delay") {
    if (contact.botPaused) {
      run.status = "paused"
      run.currentNodeId = node.id
      return "hold"
    }
    const delayMs = Number(data.delayMs ?? data.delay_ms ?? 0)
    const plan = smartResumeAt({
      now: input.now,
      delayMs: Number.isFinite(delayMs) ? delayMs : 0,
      lastInboundAt: contact.lastInboundAt,
      windowMs: data.respectWindow === false ? null : channelWindow(run.channel).windowMs,
      respectWindow: data.respectWindow !== false,
    })
    if (plan.skip) {
      const skipped = outgoing(graph, node.id, "skipped")
      run.stepToken = nextToken(run, node.id)
      if (skipped) {
        run.currentNodeId = skipped.target
        run.status = "active"
        return "continue"
      }
      run.status = "completed"
      return "stop"
    }
    run.status = "waiting"
    run.waitKind = "delay"
    run.resumeAt = plan.resumeAt
    run.currentNodeId = node.id
    run.stepToken = nextToken(run, node.id)
    effects.push({ type: "schedule", nodeId: node.id, resumeAt: plan.resumeAt, stepToken: run.stepToken })
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return "stop"
  }

  if (node.type === "ai_agent") {
    const goal = String(data.goal || data.prompt || "Help the customer.")
    const reply = run.context[`ai:${node.id}`]
    if (!reply) {
      effects.push({ type: "ai", nodeId: node.id, goal })
      run.status = "waiting"
      run.waitKind = "ai"
      run.currentNodeId = node.id
      run.stepToken = nextToken(run, node.id)
      return "stop"
    }
    const capturedRaw = run.context[`fields:${node.id}`]
    if (capturedRaw) {
      try {
        const captured = JSON.parse(capturedRaw) as Record<string, string>
        contact.customFields = { ...contact.customFields, ...captured }
      } catch {
        // A truncated field blob is ignored. The answer still sends.
      }
    }
    const handoff = run.context[`handoff:${node.id}`] === "1"
    if (data.sendReply !== false && !input.delivered.has(node.id)) {
      const decision = flowSendAllowed({
        channel: run.channel,
        now: input.now,
        lastInboundAt: contact.lastInboundAt,
        inboundJustNow: input.inboundJustNow,
        optedIn: contact.optedIn,
        tiktokEnabled: input.tiktokEnabled,
      })
      if (!decision.allowed) {
        effects.push({ type: "blocked", nodeId: node.id, reason: decision.reason || "outside_window" })
      } else if (contact.botPaused) {
        run.status = "paused"
        run.currentNodeId = node.id
        return "hold"
      } else {
        effects.push(sendEffect(node.id, { message: reply }, decision))
      }
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    if (handoff) {
      contact.botPaused = true
      effects.push({ type: "pause_bot", nodeId: node.id })
      const handed = outgoing(graph, node.id, "handoff")
      if (handed) {
        run.currentNodeId = handed.target
        run.status = "active"
        return "continue"
      }
      run.status = "completed"
      return "stop"
    }
    return go(graph, run, node.id, "default")
  }

  if (node.type === "product_card" || node.type === "capture_order") {
    if (contact.botPaused) {
      run.status = "paused"
      run.currentNodeId = node.id
      return "hold"
    }
    const ids = asStringList(data.productIds)
    const catalog = input.catalog || []
    const chosen = ids.length ? catalog.filter((product) => ids.includes(product.id)) : catalog.slice(0, 10)
    if (node.type === "capture_order") {
      if (!input.delivered.has(node.id)) {
        effects.push({ type: "order_link", nodeId: node.id, productIds: chosen.map((product) => product.id) })
      }
    } else {
      const decision = flowSendAllowed({
        channel: run.channel,
        now: input.now,
        lastInboundAt: contact.lastInboundAt,
        inboundJustNow: input.inboundJustNow,
        optedIn: contact.optedIn,
        tiktokEnabled: input.tiktokEnabled,
      })
      if (!decision.allowed) {
        effects.push({ type: "blocked", nodeId: node.id, reason: decision.reason || "outside_window" })
      } else if (!input.delivered.has(node.id)) {
        const content = productsToContent(chosen, data.text ? String(data.text) : undefined)
        effects.push(sendEffect(node.id, content, decision))
      }
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, "default")
  }

  if (node.type === "public_reply") {
    const text = pickText(data.variants, input.random)
    if (text && input.commentId && !input.delivered.has(node.id)) {
      effects.push({ type: "public_reply", nodeId: node.id, text, commentId: input.commentId })
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    return go(graph, run, node.id, "default")
  }

  if (node.type === "send_message") {
    if (contact.botPaused) {
      run.status = "paused"
      run.currentNodeId = node.id
      return "hold"
    }
    const templateName = data.templateName ? String(data.templateName) : undefined
    const decision = flowSendAllowed({
      channel: run.channel,
      now: input.now,
      lastInboundAt: contact.lastInboundAt,
      inboundJustNow: input.inboundJustNow,
      optedIn: contact.optedIn,
      templateName,
      templateApproved: input.templateApproved || data.templateApproved === true,
      tiktokEnabled: input.tiktokEnabled,
    })
    if (!decision.allowed) {
      effects.push({ type: "blocked", nodeId: node.id, reason: decision.reason || "outside_window" })
      const blocked = outgoing(graph, node.id, "blocked")
      if (blocked) {
        run.currentNodeId = blocked.target
        return "continue"
      }
      run.status = "completed"
      run.stepToken = nextToken(run, node.id)
      return "stop"
    }
    if (!input.delivered.has(node.id)) {
      const content = shapeContent(run.channel, data, contact, run.context)
      effects.push({
        ...sendEffect(node.id, content, decision),
        templateName,
        templateLanguage: data.templateLanguage ? String(data.templateLanguage) : undefined,
      })
    }
    effects.push({ type: "stat", nodeId: node.id, stat: "run" })
    const buttons = [...asButtons(data.buttons), ...asButtons(data.quickReplies)]
    const waitFor = String(data.waitFor || (buttons.length ? "button" : "none"))
    if (waitFor === "button" || waitFor === "reply") {
      run.status = "waiting"
      run.waitKind = waitFor === "reply" ? "reply" : "button"
      run.currentNodeId = node.id
      run.expectedPayloads = buttons.map((button) => button.payload)
      run.stepToken = nextToken(run, node.id)
      return "stop"
    }
    return go(graph, run, node.id, "default")
  }

  return go(graph, run, node.id, "default")
}

function sendEffect(nodeId: string, content: OutboundContent, decision: { messagingType?: "RESPONSE" | "MESSAGE_TAG"; tag?: string }): SendEffect {
  return {
    type: "send",
    nodeId,
    content,
    messagingType: decision.messagingType,
    tag: decision.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : undefined,
  }
}

function go(graph: FlowGraph, run: FlowRunState, nodeId: string, handle: string): "continue" | "stop" {
  const edge = outgoing(graph, nodeId, handle)
  if (!edge) {
    run.status = "completed"
    run.waitKind = null
    run.stepToken = nextToken(run, nodeId)
    return "stop"
  }
  run.currentNodeId = edge.target
  run.status = "active"
  return "continue"
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of value) {
    const tag = String(item || "").trim().slice(0, 40)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

function mergeTags(current: string[], extra: string[]): string[] {
  const seen = new Set(current.map((tag) => tag.toLowerCase()))
  const next = [...current]
  for (const tag of extra) {
    if (seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    next.push(tag)
    if (next.length >= 20) break
  }
  return next
}
