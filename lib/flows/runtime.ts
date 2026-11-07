import { randomUUID } from "crypto"
import { deliverContent, previewOf } from "@/lib/channels/deliver"
import { getAdapter } from "@/lib/channels/adapters"
import { ensureConversation, insertMessage, loadContact } from "@/lib/channels/store"
import type { Db, NormalizedInbound, OutboundContent, SendContext } from "@/lib/channels/types"
import { RetryableInboundError, failurePlan, DEFAULT_MAX_ATTEMPTS } from "@/lib/event-pipeline"
import { contactFromRow } from "@/lib/contacts"
import { openAccessToken } from "@/lib/token-crypto"
import { tiktokMessagingEnabled } from "@/lib/tiktok/config"
import { readTikTokSettings } from "@/lib/tiktok/settings"
import { readTikTokWindow, recordTikTokBusinessSend } from "@/lib/tiktok/windows"
import { sendWhatsAppTemplate } from "@/lib/whatsapp/templates"
import {
  applyIncoming,
  delayIdempotencyKey,
  initialStepToken,
  resumeIdempotencyKey,
  startIdempotencyKey,
} from "@/lib/flows/engine"
import { isSafeWebhookUrl } from "@/lib/flows/graph"
import { triggerMatches } from "@/lib/flows/match"
import { isOptOutText } from "@/lib/flows/opt-out"
import type { FlowContact, FlowEffect, FlowGraph, FlowRunState, FlowSignal, FlowTrigger } from "@/lib/flows/types"
import { giveawayKeywordMatches } from "@/lib/growth/tools"

function callRpc(supabase: Db, fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> {
  const client = supabase as Db & {
    rpc?: (name: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>
  }
  if (typeof client.rpc !== "function") {
    return Promise.resolve({ data: null, error: { message: `${fn} missing`, code: "PGRST202" } })
  }
  return client.rpc(fn, args)
}

function missingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table|claim_flow_jobs|bump_flow_node_stat/i.test(message)
}

function asTrigger(value: unknown): FlowTrigger {
  if (!value || typeof value !== "object") return { type: "keyword_dm" }
  return value as FlowTrigger
}

function asGraph(value: unknown): FlowGraph {
  if (!value || typeof value !== "object") return { nodes: [], edges: [] }
  const graph = value as FlowGraph
  return { nodes: Array.isArray(graph.nodes) ? graph.nodes : [], edges: Array.isArray(graph.edges) ? graph.edges : [] }
}

export function toFlowContact(row: ReturnType<typeof contactFromRow> | null, channel: string, externalId: string): FlowContact {
  return {
    id: row?.id,
    channel,
    externalId,
    tags: row?.tags || [],
    customFields: row?.custom_fields || {},
    botPaused: row?.bot_paused === true,
    optedIn: row?.opted_in === true,
    optedOut: row?.opted_out === true,
    isFollower: typeof row?.is_follower === "boolean" ? row.is_follower : null,
    lastInboundAt: row?.last_inbound_at || null,
  }
}

function runFromRow(row: any): FlowRunState {
  return {
    id: row.id,
    flowId: row.flow_id,
    versionId: row.version_id,
    contactExternalId: row.contact_external_id,
    channel: row.channel,
    status: row.status,
    currentNodeId: row.current_node_id,
    waitKind: row.wait_kind,
    resumeAt: row.resume_at ? Date.parse(row.resume_at) : null,
    expectedPayloads: Array.isArray(row.expected_payloads) ? row.expected_payloads : [],
    stepToken: row.step_token,
    steps: Number(row.steps) || 0,
    context: row.context && typeof row.context === "object" ? row.context : {},
  }
}

function deliveredOf(run: FlowRunState): string[] {
  return String(run.context.delivered || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

async function insertJob(supabase: Db, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase.from("flow_jobs").insert(row)
  if (!error) return true
  if (error.code === "23505") return false
  if (missingRelation(error)) return false
  throw error
}

export async function flowSupersedesAutomation(supabase: Db, userId: string | number, ruleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("flows")
    .select("id")
    .eq("user_id", userId)
    .eq("source_automation_id", ruleId)
    .eq("status", "live")
    .limit(1)
  if (error) {
    if (missingRelation(error)) return false
    throw error
  }
  return Array.isArray(data) && data.length > 0
}

export async function dispatchFlowTriggers(
  supabase: Db,
  tenant: { userId: string | number; workspaceId?: string | null },
  events: NormalizedInbound[],
): Promise<void> {
  if (events.length === 0) return
  const { data, error } = await supabase
    .from("flows")
    .select("id, channel, trigger, published_version_id, source_automation_id, status")
    .eq("user_id", tenant.userId)
    .eq("status", "live")
    .limit(100)
  if (error) {
    if (missingRelation(error)) return
    throw error
  }
  const flows = data || []
  const tiktokEnabled = tiktokMessagingEnabled()

  for (const event of events) {
    const contact = await loadContact(supabase, tenant.userId, event.channel, event.contactExternalId)
    if (isOptOutText(event.text)) {
      await markOptOut(supabase, tenant, event, contact?.id)
      continue
    }
    const resumed = await enqueueResumes(supabase, tenant, event, contact?.id)
    if (resumed) continue
    const firstSeen = contact
      ? Math.abs(Date.parse(contact.last_seen_at) - Date.parse(contact.first_seen_at)) < 15_000
      : true
    for (const flow of flows) {
      if (flow.channel && flow.channel !== event.channel && !(flow.channel === "messenger" && event.channel === "facebook")) {
        continue
      }
      const trigger = asTrigger(flow.trigger)
      if (!triggerMatches(trigger, event, { tiktokEnabled, firstSeen, referral: event.referral })) continue
      const eventId = event.messageId || event.commentId || `${event.kind}:${event.text}`
      await insertJob(supabase, {
        user_id: tenant.userId,
        workspace_id: tenant.workspaceId || null,
        kind: "start",
        idempotency_key: startIdempotencyKey(flow.id, event.contactExternalId, eventId),
        flow_id: flow.id,
        step_token: null,
        contact_external_id: event.contactExternalId,
        channel: event.channel,
        payload: {
          versionId: flow.published_version_id,
          eventId,
          text: event.text,
          commentId: event.commentId || null,
          accountRef: event.accountRef || null,
          messageId: event.messageId || null,
        },
        status: "pending",
        next_attempt_at: new Date().toISOString(),
      })
    }
    await recordGiveaway(supabase, tenant.userId, event)
    await noteBroadcastOpen(supabase, event.contactExternalId)
  }
}

async function enqueueResumes(
  supabase: Db,
  tenant: { userId: string | number; workspaceId?: string | null },
  event: NormalizedInbound,
  contactId?: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("flow_runs")
    .select("*")
    .eq("user_id", tenant.userId)
    .eq("contact_external_id", event.contactExternalId)
    .eq("channel", event.channel)
    .eq("status", "waiting")
    .limit(10)
  if (error) {
    if (missingRelation(error)) return false
    throw error
  }
  let queued = false
  for (const row of data || []) {
    const signalKind = event.kind === "postback" ? "button" : "reply"
    if (row.wait_kind === "button" && signalKind !== "button") continue
    if (row.wait_kind === "delay" && signalKind !== "reply") continue
    if (row.wait_kind === "ai") continue
    const eventId = event.messageId || event.commentId || event.text
    const inserted = await insertJob(supabase, {
      user_id: tenant.userId,
      workspace_id: tenant.workspaceId || null,
      kind: "resume",
      idempotency_key: resumeIdempotencyKey(row.id, row.current_node_id || "node", eventId),
      run_id: row.id,
      flow_id: row.flow_id,
      node_id: row.current_node_id,
      step_token: row.step_token,
      contact_external_id: event.contactExternalId,
      channel: event.channel,
      payload: {
        signalKind: row.wait_kind === "delay" ? "reply" : signalKind,
        eventId,
        text: event.text,
        payload: event.kind === "postback" ? event.text : null,
        commentId: event.commentId || null,
        accountRef: event.accountRef || null,
        contactId: contactId || null,
      },
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    })
    if (inserted) queued = true
  }
  return queued
}

async function markOptOut(
  supabase: Db,
  tenant: { userId: string | number },
  event: NormalizedInbound,
  contactId?: string,
): Promise<void> {
  if (contactId) {
    await supabase.from("contacts").update({ opted_out: true, updated_at: new Date().toISOString() }).eq("id", contactId)
  }
  await supabase
    .from("flow_runs")
    .update({ status: "opted_out", updated_at: new Date().toISOString() })
    .eq("user_id", tenant.userId)
    .eq("contact_external_id", event.contactExternalId)
    .in("status", ["active", "waiting", "paused"])
  await supabase
    .from("flow_jobs")
    .update({ status: "cancelled", last_error: "opted_out" })
    .eq("user_id", tenant.userId)
    .eq("contact_external_id", event.contactExternalId)
    .eq("status", "pending")
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("id")
    .eq("contact_external_id", event.contactExternalId)
    .eq("status", "active")
  if (Array.isArray(enrollments)) {
    for (const enrollment of enrollments) {
      await supabase.from("sequence_enrollments").update({ status: "opted_out", next_send_at: null, updated_at: new Date().toISOString() }).eq("id", enrollment.id)
    }
  }
}

async function recordGiveaway(supabase: Db, userId: string | number, event: NormalizedInbound): Promise<void> {
  const { data, error } = await supabase
    .from("giveaways")
    .select("id, keyword, channel, media_id, status")
    .eq("user_id", userId)
    .eq("status", "open")
    .limit(20)
  if (error || !Array.isArray(data)) return
  for (const giveaway of data) {
    if (giveaway.channel && giveaway.channel !== event.channel) continue
    if (giveaway.media_id && event.mediaId && giveaway.media_id !== event.mediaId) continue
    if (!giveawayKeywordMatches(String(giveaway.keyword || ""), event.text || "")) continue
    const inserted = await supabase.from("giveaway_entries").insert({
      giveaway_id: giveaway.id,
      contact_external_id: event.contactExternalId,
    })
    if (inserted.error && inserted.error.code !== "23505" && !missingRelation(inserted.error)) {
      console.warn("[giveaway] entry failed:", inserted.error.message)
    }
  }
}

export interface FlowDrainSummary {
  claimed: number
  done: number
  retried: number
  dead: number
  errors: string[]
}

export async function drainFlowJobs(supabase: Db): Promise<FlowDrainSummary> {
  const summary: FlowDrainSummary = { claimed: 0, done: 0, retried: 0, dead: 0, errors: [] }
  for (let batch = 0; batch < 5; batch += 1) {
    const rows = await claimFlowBatch(supabase)
    if (rows.length === 0) break
    summary.claimed += rows.length
    for (const row of rows) {
      try {
        await processFlowJob(supabase, row)
        if (row._held) continue
        await supabase
          .from("flow_jobs")
          .update({ status: "done", processed_at: new Date().toISOString(), locked_at: null, last_error: null })
          .eq("id", row.id)
        summary.done += 1
      } catch (error: any) {
        const message = error?.message || String(error)
        const attempts = Number(row.attempts || 0) + 1
        const plan = failurePlan(attempts, Date.now(), DEFAULT_MAX_ATTEMPTS)
        await supabase
          .from("flow_jobs")
          .update({
            status: plan.status,
            attempts,
            next_attempt_at: new Date(plan.nextAttemptAt).toISOString(),
            locked_at: null,
            last_error: message.slice(0, 500),
          })
          .eq("id", row.id)
        if (plan.status === "dead") summary.dead += 1
        else summary.retried += 1
        summary.errors.push(message)
      }
    }
  }
  return summary
}

async function claimFlowBatch(supabase: Db): Promise<any[]> {
  const { data, error } = await callRpc(supabase, "claim_flow_jobs", { batch_size: 10, lock_seconds: 120 })
  if (!error) return data || []
  if (!missingRelation(error) && !/claim_flow_jobs/i.test(error.message || "")) throw error
  const pending = await supabase
    .from("flow_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(10)
  if (pending.error) {
    if (missingRelation(pending.error)) return []
    throw pending.error
  }
  const rows = pending.data || []
  for (const row of rows) {
    await supabase.from("flow_jobs").update({ status: "processing", locked_at: new Date().toISOString() }).eq("id", row.id)
  }
  return rows
}

async function processFlowJob(supabase: Db, job: any): Promise<void> {
  if (job.kind === "broadcast") {
    await processBroadcastJob(supabase, job)
    return
  }
  if (job.kind === "sequence") {
    await processSequenceJob(supabase, job)
    return
  }
  if (job.kind === "resume" || job.kind === "delay") {
    await processResumeJob(supabase, job)
    return
  }
  await processStartJob(supabase, job)
}

async function processStartJob(supabase: Db, job: any): Promise<void> {
  const payload = job.payload || {}
  const existing = await supabase.from("flow_runs").select("*").eq("idempotency_key", job.idempotency_key).maybeSingle()
  if (existing.error && !missingRelation(existing.error)) throw existing.error
  const row = existing.data
  if (row?.wait_kind === "ai" && row.status === "waiting") {
    await continueAi(supabase, row, job)
    return
  }
  if (row && row.step_token !== initialStepToken(row.id)) return

  const flow = await supabase.from("flows").select("*").eq("id", job.flow_id).maybeSingle()
  if (flow.error) throw flow.error
  if (!flow.data || flow.data.status !== "live") return
  const versionId = payload.versionId || flow.data.published_version_id
  const version = await supabase.from("flow_versions").select("id, graph").eq("id", versionId).maybeSingle()
  if (version.error || !version.data) return
  const graph = asGraph(version.data.graph)
  const channel = job.channel || flow.data.channel || "instagram"
  const contactRow = await loadContact(supabase, job.user_id, channel, job.contact_external_id)
  const contact = toFlowContact(contactRow, channel, job.contact_external_id)
  if (payload.text && !contact.lastInboundAt) contact.lastInboundAt = new Date().toISOString()
  const runId = row?.id || randomUUID()
  const run: FlowRunState = row
    ? runFromRow(row)
    : {
        id: runId,
        flowId: flow.data.id,
        versionId: version.data.id,
        contactExternalId: job.contact_external_id,
        channel,
        status: "active",
        currentNodeId: null,
        waitKind: null,
        resumeAt: null,
        expectedPayloads: [],
        stepToken: initialStepToken(runId),
        steps: 0,
        context: {},
      }
  const signal: FlowSignal = {
    kind: "start",
    eventId: String(payload.eventId || job.idempotency_key),
    text: payload.text || "",
    commentId: payload.commentId || undefined,
    inboundJustNow: true,
  }
  const approved = await templateApproved(supabase, job.user_id, graph)
  const result = applyIncoming({
    graph,
    run,
    contact,
    signal,
    now: Date.now(),
    deliveredNodeIds: deliveredOf(run),
    random: Math.random,
    tiktokEnabled: tiktokMessagingEnabled(),
    templateApproved: approved,
    catalog: await loadCatalog(supabase, job.user_id, graph),
  })
  await commitResult(supabase, job, flow.data, result, payload.accountRef || null)
}

async function processResumeJob(supabase: Db, job: any): Promise<void> {
  const payload = job.payload || {}
  const loaded = await supabase.from("flow_runs").select("*").eq("id", job.run_id).maybeSingle()
  if (loaded.error) throw loaded.error
  if (!loaded.data) return
  if (loaded.data.wait_kind === "ai" && payload.signalKind === "ai") {
    await continueAi(supabase, loaded.data, job)
    return
  }
  const flow = await supabase.from("flows").select("*").eq("id", loaded.data.flow_id).maybeSingle()
  if (!flow.data) return
  const version = await supabase.from("flow_versions").select("id, graph").eq("id", loaded.data.version_id).maybeSingle()
  if (!version.data) return
  const run = runFromRow(loaded.data)
  const contactRow = await loadContact(supabase, job.user_id, run.channel, run.contactExternalId)
  const contact = toFlowContact(contactRow, run.channel, run.contactExternalId)
  const signal: FlowSignal = {
    kind: payload.signalKind || (job.kind === "delay" ? "delay" : "reply"),
    eventId: String(payload.eventId || job.id),
    text: payload.text || "",
    payload: payload.payload || undefined,
    commentId: payload.commentId || undefined,
    inboundJustNow: false,
  }
  const result = applyIncoming({
    graph: asGraph(version.data.graph),
    run,
    contact,
    signal,
    now: Date.now(),
    expectedStepToken: job.step_token || run.stepToken,
    deliveredNodeIds: deliveredOf(run),
    random: Math.random,
    tiktokEnabled: tiktokMessagingEnabled(),
    templateApproved: await templateApproved(supabase, job.user_id, asGraph(version.data.graph)),
    catalog: await loadCatalog(supabase, job.user_id, asGraph(version.data.graph)),
  })
  if (result.stale) return
  if (result.hold) {
    await supabase
      .from("flow_jobs")
      .update({
        status: "pending",
        locked_at: null,
        next_attempt_at: new Date(result.retryAt || Date.now() + 60_000).toISOString(),
      })
      .eq("id", job.id)
    job._held = true
    await saveRun(supabase, job, flow.data, result.run, result.contact)
    return
  }
  await commitResult(supabase, job, flow.data, result, payload.accountRef || null)
}

async function continueAi(supabase: Db, row: any, job: any): Promise<void> {
  const flow = await supabase.from("flows").select("*").eq("id", row.flow_id).maybeSingle()
  const version = await supabase.from("flow_versions").select("graph").eq("id", row.version_id).maybeSingle()
  if (!flow.data || !version.data) return
  const graph = asGraph(version.data.graph)
  const node = graph.nodes.find((item) => item.id === row.current_node_id)
  const goal = String(node?.data?.goal || node?.data?.prompt || "Help the customer.")
  const { answerWithWorkspaceAgent } = await import("@/lib/ai-agent/service")
  const message = String(row.context?.lastText || job.payload?.text || "")
  const decision = await answerWithWorkspaceAgent({
    supabase,
    userId: job.user_id,
    workspaceId: job.workspace_id || flow.data.workspace_id || null,
    message,
    goal,
    channel: row.channel,
    contactExternalId: row.contact_external_id,
  })
  const reply = decision?.reply
  if (!reply) throw new RetryableInboundError("AI agent returned an empty reply")
  const run = runFromRow(row)
  const contactRow = await loadContact(supabase, job.user_id, run.channel, run.contactExternalId)
  const result = applyIncoming({
    graph,
    run,
    contact: toFlowContact(contactRow, run.channel, run.contactExternalId),
    signal: {
      kind: "ai",
      eventId: `ai:${row.id}:${row.step_token}`,
      aiReply: reply,
      handoff: decision.handoff,
      captured: decision.fields,
      inboundJustNow: false,
    },
    catalog: await loadCatalog(supabase, job.user_id, graph),
    now: Date.now(),
    expectedStepToken: run.stepToken,
    deliveredNodeIds: deliveredOf(run),
    random: Math.random,
    tiktokEnabled: tiktokMessagingEnabled(),
  })
  await commitResult(supabase, job, flow.data, result, job.payload?.accountRef || null)
}

async function commitResult(
  supabase: Db,
  job: any,
  flow: any,
  result: { run: FlowRunState; contact: FlowContact; effects: FlowEffect[] },
  accountRef: string | null,
): Promise<void> {
  const sendNodes = result.effects.filter((effect) => effect.type === "send" || effect.type === "public_reply").map((effect) => effect.nodeId)
  const delivered = new Set([...deliveredOf(result.run), ...sendNodes])
  result.run.context.delivered = [...delivered].join(",")
  await saveRun(supabase, job, flow, result.run, result.contact)
  await applyContact(supabase, job, flow, result.contact)
  for (const effect of result.effects) {
    if (effect.type === "schedule") {
      await insertJob(supabase, {
        user_id: job.user_id,
        workspace_id: job.workspace_id || flow.workspace_id || null,
        kind: "delay",
        idempotency_key: delayIdempotencyKey(result.run.id, effect.nodeId),
        run_id: result.run.id,
        flow_id: result.run.flowId,
        node_id: effect.nodeId,
        step_token: effect.stepToken,
        contact_external_id: result.run.contactExternalId,
        channel: result.run.channel,
        payload: { signalKind: "delay", eventId: delayIdempotencyKey(result.run.id, effect.nodeId), accountRef },
        status: "pending",
        next_attempt_at: new Date(effect.resumeAt).toISOString(),
      })
    }
  }
  await performEffects(supabase, job, flow, result, accountRef)
  await bumpStats(supabase, result.run.flowId, result.effects)
  const ai = result.effects.find((effect) => effect.type === "ai")
  if (ai && result.run.waitKind === "ai") {
    const fresh = await supabase.from("flow_runs").select("*").eq("id", result.run.id).maybeSingle()
    if (fresh.data) await continueAi(supabase, fresh.data, job)
  }
}

async function saveRun(supabase: Db, job: any, flow: any, run: FlowRunState, contact: FlowContact): Promise<void> {
  const row = {
    id: run.id,
    flow_id: run.flowId,
    version_id: run.versionId,
    workspace_id: job.workspace_id || flow.workspace_id || null,
    user_id: job.user_id,
    contact_id: contact.id || null,
    contact_external_id: run.contactExternalId,
    channel: run.channel,
    status: run.status,
    current_node_id: run.currentNodeId,
    wait_kind: run.waitKind,
    resume_at: run.resumeAt ? new Date(run.resumeAt).toISOString() : null,
    step_token: run.stepToken,
    expected_payloads: run.expectedPayloads,
    context: run.context,
    idempotency_key: job.kind === "start" ? job.idempotency_key : `run:${run.id}`,
    steps: run.steps,
    updated_at: new Date().toISOString(),
  }
  const updated = await supabase.from("flow_runs").update(row).eq("id", run.id).select("id").maybeSingle()
  if (updated.error && !/0 rows|Cannot coerce/i.test(updated.error.message || "")) {
    if (!missingRelation(updated.error)) console.warn("[flows] run update failed:", updated.error.message)
  }
  if (!updated.data) {
    const inserted = await supabase.from("flow_runs").insert(row)
    if (inserted.error && inserted.error.code !== "23505" && !missingRelation(inserted.error)) {
      throw inserted.error
    }
  }
}

async function loadCatalog(supabase: Db, userId: string | number, graph: FlowGraph) {
  const needs = graph.nodes.some((node) => node.type === "product_card" || node.type === "capture_order")
  if (!needs) return []
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, price_cents, currency, image_url, product_url, in_stock")
    .eq("user_id", userId)
    .limit(100)
  if (error || !Array.isArray(data)) return []
  return data.map((row: any) => ({
    id: String(row.id),
    name: String(row.name || "Product"),
    description: row.description || null,
    priceCents: Number(row.price_cents || 0),
    currency: String(row.currency || "EGP"),
    imageUrl: row.image_url || null,
    productUrl: row.product_url || null,
    inStock: row.in_stock !== false,
  }))
}

async function applyContact(supabase: Db, job: any, flow: any, contact: FlowContact): Promise<void> {
  let previousTags: string[] = []
  if (contact.id) {
    const existing = await supabase.from("contacts").select("tags").eq("id", contact.id).maybeSingle()
    previousTags = Array.isArray(existing.data?.tags) ? existing.data.tags : []
  }
  const patch: Record<string, unknown> = {
    tags: contact.tags,
    custom_fields: contact.customFields,
    bot_paused: contact.botPaused,
    opted_in: contact.optedIn,
    opted_out: contact.optedOut,
    is_follower: contact.isFollower,
    updated_at: new Date().toISOString(),
  }
  if (contact.customFields.email) patch.email = contact.customFields.email
  if (contact.customFields.phone) patch.phone = contact.customFields.phone
  if (contact.id) {
    const updated = await supabase.from("contacts").update(patch).eq("id", contact.id)
    const added = contact.tags.filter((tag) => !previousTags.some((item) => item.toLowerCase() === tag.toLowerCase()))
    if (added.length) {
      const { emitIntegrationEvent } = await import("@/lib/integrations/dispatch")
      await emitIntegrationEvent(supabase, {
        workspaceId: job.workspace_id || flow.workspace_id || null,
        userId: job.user_id,
        type: "tag.added",
        data: { contactId: contact.id, externalId: contact.externalId, tags: added },
      })
    }
    if (updated.error && /opted_in|opted_out|is_follower/i.test(updated.error.message || "")) {
      await supabase
        .from("contacts")
        .update({ tags: contact.tags, custom_fields: contact.customFields, bot_paused: contact.botPaused, updated_at: patch.updated_at })
        .eq("id", contact.id)
    }
    return
  }
  const inserted = await supabase
    .from("contacts")
    .insert({
      ...patch,
      workspace_id: job.workspace_id || flow.workspace_id || null,
      user_id: job.user_id,
      channel: contact.channel,
      external_id: contact.externalId,
      source: "flow",
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle()
  if (!inserted.error && inserted.data?.id) contact.id = inserted.data.id
}

async function performEffects(
  supabase: Db,
  job: any,
  flow: any,
  result: { run: FlowRunState; contact: FlowContact; effects: FlowEffect[] },
  accountRef: string | null,
): Promise<void> {
  const sender = await loadSender(supabase, job.user_id, result.run.channel, accountRef)
  for (const effect of result.effects) {
    if (effect.type === "public_reply" && effect.commentId && sender) {
      const adapter = getAdapter(result.run.channel === "facebook" ? "messenger" : result.run.channel)
      if (adapter?.publicReply) {
        await adapter.publicReply({ accessToken: sender.token, senderRef: sender.senderRef }, effect.commentId, effect.text)
      }
    }
    if (effect.type === "order_link") {
      await captureOrderLink(supabase, job, flow, result.run, effect.productIds, sender)
    }
    if (effect.type === "send") {
      await sendFlowMessage(supabase, job, flow, result.run, effect.content, sender, effect)
    }
    if (effect.type === "webhook" && isSafeWebhookUrl(effect.url) && (await (await import("@/lib/net/public-host")).resolvesToPublicHost(effect.url))) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        await fetch(effect.url, {
          method: effect.method,
          headers: effect.method === "POST" ? { "content-type": "application/json" } : undefined,
          body: effect.method === "POST" ? effect.body || "{}" : undefined,
          redirect: "manual",
          signal: controller.signal,
        })
      } catch (error) {
        console.warn("[flows] webhook failed:", error)
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

async function captureOrderLink(
  supabase: Db,
  job: any,
  flow: any,
  run: FlowRunState,
  productIds: string[],
  sender: { token: string; senderRef?: string } | null,
): Promise<void> {
  const { placeOrder } = await import("@/lib/commerce/checkout")
  const placed = await placeOrder({
    supabase,
    userId: job.user_id,
    workspaceId: job.workspace_id || flow.workspace_id || null,
    contactExternalId: run.contactExternalId,
    channel: run.channel,
    productIds,
  })
  if (!placed) return
  const text = placed.paymentLink ? `Pay here: ${placed.paymentLink}` : "Your order is saved. The team will confirm payment."
  await sendFlowMessage(supabase, job, flow, run, { message: text }, sender, {
    type: "send",
    nodeId: "order",
    content: { message: text },
  })
}

async function sendFlowMessage(
  supabase: Db,
  job: any,
  flow: any,
  run: FlowRunState,
  content: OutboundContent,
  sender: { token: string; senderRef?: string; tiktokRegion?: string | null } | null,
  effect: Extract<FlowEffect, { type: "send" }>,
): Promise<void> {
  const channel = run.channel === "facebook" ? "messenger" : run.channel
  if (channel === "webchat" || channel === "bio" || !sender) {
    await recordOutbound(supabase, job, run, previewOf(content))
    return
  }
  if (effect.templateName && channel === "whatsapp" && sender.senderRef) {
    const outcome = await sendWhatsAppTemplate(fetch, {
      phoneNumberId: sender.senderRef,
      accessToken: sender.token,
      to: run.contactExternalId,
      name: effect.templateName,
      language: effect.templateLanguage || "en",
    })
    if (!outcome.ok) throw new RetryableInboundError(outcome.error || "template send failed")
    await recordOutbound(supabase, job, run, effect.templateName)
    return
  }
  const adapter = getAdapter(channel)
  if (!adapter) return
  const tiktokWindow = channel === "tiktok" && sender.senderRef
    ? await readTikTokWindow(supabase, sender.senderRef, run.contactExternalId)
    : undefined
  const ctx: SendContext = {
    accessToken: sender.token,
    recipientId: run.contactExternalId,
    senderRef: sender.senderRef,
    messagingType: effect.messagingType === "MESSAGE_TAG" ? "MESSAGE_TAG" : "RESPONSE",
    tag: effect.tag,
    tiktokRegion: channel === "tiktok" ? (sender.tiktokRegion ?? null) : undefined,
    tiktokWindow,
  }
  const outcome = await deliverContent(adapter, ctx, content)
  if (channel === "tiktok" && !outcome.ok) {
    console.warn("[tiktok] flow send blocked:", outcome.error)
    return
  }
  if (channel === "tiktok" && outcome.ok && tiktokWindow && sender.senderRef) {
    await recordTikTokBusinessSend(supabase, sender.senderRef, run.contactExternalId, tiktokWindow)
  }
  await recordOutbound(supabase, job, run, previewOf(content))
}

async function recordOutbound(supabase: Db, job: any, run: FlowRunState, text: string): Promise<void> {
  const conversation = await ensureConversation(supabase, {
    userId: job.user_id,
    recipientId: run.contactExternalId,
    username: run.contactExternalId,
    platform: run.channel,
    workspaceId: job.workspace_id || null,
  })
  if (!conversation) return
  await insertMessage(supabase, {
    id: `flow_${run.id}_${run.stepToken}`.replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 180),
    conversation_id: conversation.id,
    user_id: job.user_id,
    sender_id: "flow",
    sender_username: "Bot",
    content: text,
    direction: "out",
    platform: run.channel,
  })
}

async function loadSender(
  supabase: Db,
  userId: string | number,
  channel: string,
  accountRef?: string | null,
): Promise<{ token: string; senderRef?: string; tiktokRegion?: string | null } | null> {
  if (channel === "webchat" || channel === "bio") return { token: "webchat" }
  if (channel === "instagram") {
    const { data } = await supabase.from("users").select("access_token, page_id, business_account_id").eq("id", userId).maybeSingle()
    if (!data?.access_token) return null
    try {
      return {
        token: openAccessToken(data.access_token) || data.access_token,
        senderRef: data.business_account_id || data.page_id || undefined,
      }
    } catch {
      return null
    }
  }
  const platform = channel === "facebook" ? "messenger" : channel
  const { data } = await supabase.from("platform_connections").select("access_token, page_id, metadata").eq("user_id", userId).eq("platform", platform).limit(10)
  const rows = data || []
  const row = accountRef ? rows.find((item: any) => item.page_id === accountRef) : rows[0]
  if (!row?.access_token) return null
  let token = row.access_token
  try {
    token = openAccessToken(row.access_token) || row.access_token
  } catch {
    token = row.access_token
  }
  const settings = platform === "tiktok" ? readTikTokSettings(row.metadata) : null
  return { token, senderRef: row.page_id || undefined, tiktokRegion: settings ? settings.region : undefined }
}

async function templateApproved(supabase: Db, userId: string | number, graph: FlowGraph): Promise<boolean> {
  const names = graph.nodes.map((node) => node.data?.templateName).filter((name): name is string => typeof name === "string" && name.length > 0)
  if (names.length === 0) return false
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("name, status")
    .eq("user_id", userId)
    .in("name", names)
  if (error || !Array.isArray(data)) return false
  return data.some((row: any) => String(row.status || "").toUpperCase() === "APPROVED")
}

async function bumpStats(supabase: Db, flowId: string, effects: FlowEffect[]): Promise<void> {
  const counts = new Map<string, { runs: number; clicks: number }>()
  for (const effect of effects) {
    if (effect.type !== "stat") continue
    const current = counts.get(effect.nodeId) || { runs: 0, clicks: 0 }
    if (effect.stat === "click") current.clicks += 1
    else current.runs += 1
    counts.set(effect.nodeId, current)
  }
  for (const [nodeId, count] of counts) {
    const { error } = await callRpc(supabase, "bump_flow_node_stat", {
      p_flow_id: flowId,
      p_node_id: nodeId,
      p_runs: count.runs,
      p_clicks: count.clicks,
    })
    if (error && !missingRelation(error)) console.warn("[flows] stat bump failed:", error.message)
  }
}

async function processBroadcastJob(supabase: Db, job: any): Promise<void> {
  const broadcastId = job.payload?.broadcastId
  const { data: broadcast } = await supabase.from("broadcasts").select("*").eq("id", broadcastId).maybeSingle()
  if (!broadcast || broadcast.status === "cancelled") return
  const contact = await loadContact(supabase, job.user_id, job.channel, job.contact_external_id)
  const { evaluateBroadcastCompliance } = await import("@/lib/flows/policy")
  const decision = evaluateBroadcastCompliance({
    channel: job.channel,
    now: Date.now(),
    lastInboundAt: contact?.last_inbound_at || null,
    optedIn: contact?.opted_in === true,
    optedOut: contact?.opted_out === true,
    templateName: broadcast.template_name,
    templateApproved: broadcast.template_name ? await templateIsApproved(supabase, job.user_id, broadcast.template_name) : false,
    messageTag: broadcast.message_tag,
  })
  if (!decision.allowed) {
    await supabase
      .from("broadcast_recipients")
      .update({ status: "skipped", skip_reason: decision.reason || "blocked" })
      .eq("idempotency_key", job.idempotency_key)
    return
  }
  const { attachTrackedLinks } = await import("@/lib/channels/store")
  const content = await attachTrackedLinks(supabase, (broadcast.content || {}) as OutboundContent, {
    userId: job.user_id,
    workspaceId: broadcast.workspace_id,
    channel: job.channel,
    contactExternalId: job.contact_external_id,
    broadcastId: broadcast.id,
  })
  const sender = await loadSender(supabase, job.user_id, job.channel, null)
  if (broadcast.template_name && job.channel === "whatsapp" && sender?.senderRef) {
    const outcome = await sendWhatsAppTemplate(fetch, {
      phoneNumberId: sender.senderRef,
      accessToken: sender.token,
      to: job.contact_external_id,
      name: broadcast.template_name,
      language: broadcast.template_language || "en",
    })
    if (!outcome.ok) throw new RetryableInboundError(outcome.error || "broadcast template failed")
  } else if (sender && job.channel !== "webchat") {
    const adapter = getAdapter(job.channel)
    if (adapter) {
      await deliverContent(adapter, {
        accessToken: sender.token,
        recipientId: job.contact_external_id,
        senderRef: sender.senderRef,
        messagingType: decision.messagingType === "MESSAGE_TAG" ? "MESSAGE_TAG" : "RESPONSE",
        tag: decision.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : undefined,
      }, content)
    }
  }
  await supabase
    .from("broadcast_recipients")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("idempotency_key", job.idempotency_key)
}

async function templateIsApproved(supabase: Db, userId: string | number, name: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("status")
    .eq("user_id", userId)
    .eq("name", name)
    .limit(1)
  return String(data?.[0]?.status || "").toUpperCase() === "APPROVED"
}

async function processSequenceJob(supabase: Db, job: any): Promise<void> {
  const { data: enrollment } = await supabase.from("sequence_enrollments").select("*").eq("id", job.payload?.enrollmentId).maybeSingle()
  if (!enrollment || enrollment.status !== "active") return
  const { data: sequence } = await supabase.from("sequences").select("*").eq("id", enrollment.sequence_id).maybeSingle()
  if (!sequence || sequence.status !== "live") return
  const steps = Array.isArray(sequence.steps) ? sequence.steps : []
  const step = steps[enrollment.step_index]
  if (!step) {
    await supabase.from("sequence_enrollments").update({ status: "completed", next_send_at: null }).eq("id", enrollment.id)
    return
  }
  const contact = await loadContact(supabase, job.user_id, enrollment.channel, enrollment.contact_external_id)
  if (contact?.opted_out) {
    await supabase.from("sequence_enrollments").update({ status: "opted_out", next_send_at: null }).eq("id", enrollment.id)
    return
  }
  const { evaluateBroadcastCompliance } = await import("@/lib/flows/policy")
  const { markStepSent, sequenceJobKey } = await import("@/lib/broadcasts/sequence")
  const decision = evaluateBroadcastCompliance({
    channel: enrollment.channel,
    now: Date.now(),
    lastInboundAt: contact?.last_inbound_at || null,
    optedIn: contact?.opted_in === true,
    optedOut: false,
    templateName: step.templateName || null,
    templateApproved: step.templateName ? await templateIsApproved(supabase, job.user_id, step.templateName) : false,
    messageTag: step.messageTag || null,
  })
  if (decision.allowed) {
    const sender = await loadSender(supabase, job.user_id, enrollment.channel, null)
    const content: OutboundContent = { message: step.text || "" }
    if (sender && enrollment.channel !== "webchat" && enrollment.channel !== "bio") {
      if (step.templateName && enrollment.channel === "whatsapp" && sender.senderRef) {
        await sendWhatsAppTemplate(fetch, {
          phoneNumberId: sender.senderRef,
          accessToken: sender.token,
          to: enrollment.contact_external_id,
          name: step.templateName,
          language: step.templateLanguage || "en",
        })
      } else {
        const adapter = getAdapter(enrollment.channel)
        if (adapter) {
          await deliverContent(adapter, {
            accessToken: sender.token,
            recipientId: enrollment.contact_external_id,
            senderRef: sender.senderRef,
            messagingType: decision.messagingType === "MESSAGE_TAG" ? "MESSAGE_TAG" : "RESPONSE",
            tag: decision.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : undefined,
          }, content)
        }
      }
    }
  }
  const next = markStepSent(
    {
      id: enrollment.id,
      sequenceId: enrollment.sequence_id,
      contactExternalId: enrollment.contact_external_id,
      channel: enrollment.channel,
      stepIndex: enrollment.step_index,
      status: "active",
      nextSendAt: enrollment.next_send_at ? Date.parse(enrollment.next_send_at) : null,
    },
    steps,
    Date.now(),
  )
  await supabase
    .from("sequence_enrollments")
    .update({
      step_index: next.stepIndex,
      status: next.status,
      next_send_at: next.nextSendAt ? new Date(next.nextSendAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollment.id)
  if (next.status === "active" && next.nextSendAt) {
    await insertJob(supabase, {
      user_id: job.user_id,
      workspace_id: job.workspace_id || null,
      kind: "sequence",
      idempotency_key: sequenceJobKey(enrollment.id, next.stepIndex),
      contact_external_id: enrollment.contact_external_id,
      channel: enrollment.channel,
      payload: { enrollmentId: enrollment.id },
      status: "pending",
      next_attempt_at: new Date(next.nextSendAt).toISOString(),
    })
  }
}

export async function enqueueOrderFlowStarts(
  supabase: Db,
  tenant: { userId: string | number; workspaceId?: string | null },
  order: { id: string; status: string; contactExternalId: string; channel: string },
): Promise<void> {
  const { orderStatusMatches } = await import("@/lib/commerce/orders")
  const { data, error } = await supabase
    .from("flows")
    .select("id, channel, trigger, published_version_id, status")
    .eq("user_id", tenant.userId)
    .eq("status", "live")
    .limit(100)
  if (error || !Array.isArray(data)) return
  for (const flow of data) {
    const trigger = asTrigger(flow.trigger)
    if (trigger.type !== "order_status") continue
    if (flow.channel && flow.channel !== order.channel) continue
    if (!orderStatusMatches(trigger.keywords, order.status)) continue
    await insertJob(supabase, {
      user_id: tenant.userId,
      workspace_id: tenant.workspaceId || null,
      kind: "start",
      idempotency_key: startIdempotencyKey(flow.id, order.contactExternalId, `order:${order.id}:${order.status}`),
      flow_id: flow.id,
      contact_external_id: order.contactExternalId,
      channel: order.channel,
      payload: {
        versionId: flow.published_version_id,
        eventId: `order:${order.id}:${order.status}`,
        text: `order ${order.status}`,
        accountRef: null,
      },
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    })
  }
}

export async function noteBroadcastOpen(supabase: Db, externalId: string): Promise<void> {
  const { data, error } = await supabase
    .from("broadcast_recipients")
    .select("id, status")
    .eq("contact_external_id", externalId)
    .in("status", ["sent", "delivered"])
    .limit(20)
  if (error || !Array.isArray(data)) return
  for (const row of data) {
    await supabase.from("broadcast_recipients").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", row.id)
  }
}
