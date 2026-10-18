import { decideAgentTurn, type AgentDecision } from "@/lib/ai-agent/decide"
import { embedText, hashEmbedding, vectorLiteral, type EmbedderName } from "@/lib/ai-agent/embed"
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from "@/lib/ai-agent/guardrails"
import { buildAgentPrompt } from "@/lib/ai-agent/prompt"
import { rankChunks, type KnowledgeChunk, type RetrievedChunk } from "@/lib/ai-agent/retrieve"
import { detectDialect } from "@/lib/ai-agent/dialect"
import type { Db } from "@/lib/channels/types"

export interface AgentTurnRequest {
  supabase: Db
  userId: string | number
  workspaceId?: string | null
  accountId?: string | null
  message: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  goal?: string | null
  channel?: string | null
  contactExternalId?: string | null
  /** Playground turns are logged but do not write the contact. */
  playground?: boolean
}

function missing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table/i.test(message)
}

export function settingsFromRow(row: any): AgentSettings {
  if (!row) return { ...DEFAULT_AGENT_SETTINGS }
  const tone = row.tone === "professional" || row.tone === "concise" ? row.tone : "friendly"
  const fields = Array.isArray(row.qualify_fields) ? row.qualify_fields.map((field: unknown) => String(field)) : DEFAULT_AGENT_SETTINGS.qualifyFields
  return {
    enabled: row.enabled !== false,
    personaName: String(row.persona_name || DEFAULT_AGENT_SETTINGS.personaName),
    persona: String(row.persona || DEFAULT_AGENT_SETTINGS.persona),
    tone,
    handoffBelow: Number(row.handoff_below ?? DEFAULT_AGENT_SETTINGS.handoffBelow),
    stayOnTopic: row.stay_on_topic !== false,
    minSimilarity: Number(row.min_similarity ?? DEFAULT_AGENT_SETTINGS.minSimilarity),
    qualifyFields: fields.length ? fields : DEFAULT_AGENT_SETTINGS.qualifyFields,
  }
}

async function loadSettings(supabase: Db, userId: string | number): Promise<AgentSettings> {
  const { data, error } = await supabase.from("ai_agent_settings").select("*").eq("user_id", userId).maybeSingle()
  if (error) {
    if (missing(error)) return { ...DEFAULT_AGENT_SETTINGS }
    throw error
  }
  return settingsFromRow(data)
}

function asVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
  if (typeof value === "string" && value.startsWith("[")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
  }
  return []
}

async function retrieve(supabase: Db, userId: string | number, message: string): Promise<RetrievedChunk[]> {
  const embedded = await embedText(message)
  const rpc = await callMatch(supabase, userId, embedded.vector, embedded.embedder)
  if (rpc && rpc.length > 0) return rpc
  const selected = await supabase
    .from("knowledge_chunks")
    .select("id, source_id, content, embedding, embedder")
    .eq("user_id", userId)
    .limit(200)

  let chunks: KnowledgeChunk[] = []
  if (!selected.error && Array.isArray(selected.data) && selected.data.length > 0) {
    chunks = selected.data.map((row: any) => ({
      id: row.id,
      sourceId: row.source_id,
      title: null,
      content: String(row.content || ""),
      embedding: asVector(row.embedding),
      embedder: String(row.embedder || "hash-v1"),
    }))
  }

  // Fallback directly to knowledge_sources if chunks are empty
  if (chunks.length === 0) {
    const { data: sources } = await supabase
      .from("knowledge_sources")
      .select("id, kind, title, body")
      .eq("user_id", userId)
      .limit(50)
    if (Array.isArray(sources) && sources.length > 0) {
      const { computeLexicalOverlap } = await import("@/lib/ai-agent/retrieve")
      return sources
        .map((s) => {
          const content = `Q: ${s.title}\nA: ${s.body}`
          const lexical = computeLexicalOverlap(message, `${s.title} ${s.body}`)
          return {
            id: String(s.id),
            sourceId: String(s.id),
            title: s.title,
            content,
            similarity: Number(Math.max(0.2, 0.45 + lexical * 0.5).toFixed(4)),
          }
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 4)
    }
    return []
  }

  const embedder: EmbedderName = chunks.some((chunk) => chunk.embedder === embedded.embedder) ? embedded.embedder : "hash-v1"
  const query = embedder === "hash-v1" ? hashEmbedding(message) : embedded.vector
  return rankChunks(query, chunks, embedder, 4, message)
}

async function callMatch(supabase: Db, userId: string | number, vector: number[], embedder: string): Promise<RetrievedChunk[] | null> {
  const client = supabase as Db & { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> }
  if (typeof client.rpc !== "function") return null
  const { data, error } = await client.rpc("match_knowledge_chunks", {
    p_user_id: userId,
    p_embedding: vectorLiteral(vector),
    p_embedder: embedder,
    p_limit: 4,
  })
  if (error || !Array.isArray(data)) return null
  return data.map((row: any) => ({
    id: String(row.id),
    sourceId: row.source_id || null,
    title: row.title || null,
    content: String(row.content || ""),
    similarity: Number(row.similarity || 0),
  }))
}

export async function answerWithWorkspaceAgent(input: AgentTurnRequest): Promise<AgentDecision | null> {
  const settings = await loadSettings(input.supabase, input.userId)
  if (!settings.enabled) return null
  const retrieved = await retrieve(input.supabase, input.userId, input.message)
  const detection = detectDialect(input.message)
  const system = buildAgentPrompt({ settings, detection, retrieved, goal: input.goal })
  const history = (input.history || []).slice(-8).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 2000),
  }))
  let modelText: string | null = null
  try {
    const { generateCompletion } = await import("@/lib/llm-provider")
    modelText = await generateCompletion(String(input.userId), String(input.accountId || input.userId), "auto_reply", "send_trigger_replies", {
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: input.message }],
      response_format: { type: "json_object" },
    })
  } catch (error) {
    console.error("[ai-agent] completion failed:", error)
    modelText = null
  }
  const decision = decideAgentTurn({
    message: input.message,
    settings,
    retrieved,
    modelText,
  })
  await logAnswer(input, decision)
  if (!input.playground) await persistLead(input, decision)
  return decision
}

async function logAnswer(input: AgentTurnRequest, decision: AgentDecision): Promise<void> {
  const { error } = await input.supabase.from("ai_answer_logs").insert({
    workspace_id: input.workspaceId || null,
    user_id: input.userId,
    contact_external_id: input.contactExternalId || (input.playground ? "playground" : null),
    channel: input.channel || (input.playground ? "playground" : null),
    question: input.message.slice(0, 4000),
    answer: decision.reply.slice(0, 4000),
    dialect: decision.dialect,
    gulf: decision.gulf,
    arabizi: decision.arabizi,
    confidence: decision.confidence,
    handoff: decision.handoff,
    handoff_reason: decision.handoffReason,
    sources: decision.sources,
  })
  if (error && !missing(error)) console.warn("[ai-agent] log failed:", error.message)
}

async function persistLead(input: AgentTurnRequest, decision: AgentDecision): Promise<void> {
  if (!input.contactExternalId || !input.channel) return
  if (Object.keys(decision.fields).length === 0 && !decision.handoff) return
  const existing = await input.supabase
    .from("contacts")
    .select("id, custom_fields, tags, email, phone")
    .eq("user_id", input.userId)
    .eq("channel", input.channel)
    .eq("external_id", input.contactExternalId)
    .maybeSingle()
  if (existing.error && missing(existing.error)) return
  const custom = { ...(existing.data?.custom_fields || {}), ...decision.fields }
  const patch: Record<string, unknown> = {
    custom_fields: custom,
    updated_at: new Date().toISOString(),
  }
  if (decision.fields.email) patch.email = decision.fields.email
  if (decision.fields.phone) patch.phone = decision.fields.phone
  if (decision.handoff) patch.bot_paused = true
  if (existing.data?.id) {
    await input.supabase.from("contacts").update(patch).eq("id", existing.data.id)
  }
  if (Object.keys(decision.fields).length > 0) {
    const { emitIntegrationEvent } = await import("@/lib/integrations/dispatch")
    await emitIntegrationEvent(input.supabase, {
      workspaceId: input.workspaceId || null,
      userId: input.userId,
      type: "lead.qualified",
      data: { contactExternalId: input.contactExternalId, channel: input.channel, fields: decision.fields },
    })
  }
}
