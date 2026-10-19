import { detectDialect, type DialectDetection } from "@/lib/ai-agent/dialect"
import { applyGuardrails, type AgentSettings } from "@/lib/ai-agent/guardrails"
import { extractLeadFields } from "@/lib/ai-agent/qualify"
import type { RetrievedChunk } from "@/lib/ai-agent/retrieve"

export interface AgentDecision {
  reply: string
  dialect: DialectDetection["dialect"]
  gulf: DialectDetection["gulf"]
  arabizi: boolean
  confidence: number
  handoff: boolean
  handoffReason: string | null
  offTopic: boolean
  sources: Array<{ id: string; excerpt: string; similarity: number }>
  fields: Record<string, string>
}

interface ModelPayload {
  reply?: string
  confidence?: number
  handoff?: boolean
  fields?: Record<string, string>
  used_source_ids?: number[]
}

export function parseModelPayload(raw: string | null): ModelPayload {
  if (!raw) return {}
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return { reply: raw.trim() }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!parsed || typeof parsed !== "object") return { reply: raw.trim() }
    return parsed as ModelPayload
  } catch {
    return { reply: raw.trim() }
  }
}

/**
 * Pure turn. The caller supplies the model text and the retrieved passages.
 * Guardrails can replace the reply, force a handoff, or drop an invented price.
 */
export function decideAgentTurn(input: {
  message: string
  settings: AgentSettings
  retrieved: RetrievedChunk[]
  modelText: string | null
}): AgentDecision {
  const detection = detectDialect(input.message)
  const model = parseModelPayload(input.modelText)
  const used = new Set((model.used_source_ids || []).map((id) => Number(id)))
  const chosen = used.size
    ? input.retrieved.filter((_, index) => used.has(index + 1))
    : input.retrieved.slice(0, 3)

  let rawReply = String(model.reply || "").trim()
  let confidence = Number(model.confidence ?? 0.8)
  if (!rawReply && chosen.length > 0 && (chosen[0].similarity >= input.settings.minSimilarity)) {
    const topContent = chosen[0].content
    const parts = topContent.split(/\n\s*(?:A|الجواب|الإجابة|ج):\s*/i)
    if (parts.length > 1) {
      rawReply = parts.slice(1).join("\n").trim()
    } else {
      const answerMatch = topContent.match(/(?:A:|الجواب:|الإجابة:|ج:)\s*([^\n]+(?:\n[^\n]+)*)/i)
      rawReply = answerMatch ? answerMatch[1].trim() : topContent
    }
    // High confidence for direct Q&A knowledge match so guardrails don't append handoff warnings
    confidence = Math.max(0.85, chosen[0].similarity)
  }

  const guarded = applyGuardrails({
    message: input.message,
    reply: rawReply,
    confidence,
    detection,
    retrieved: input.retrieved,
    settings: input.settings,
    modelHandoff: model.handoff === true,
  })
  const fields = extractLeadFields(input.message, model.fields || {})
  const wanted = new Set(input.settings.qualifyFields.map((field) => field.toLowerCase()))
  const captured: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (wanted.size === 0 || wanted.has(key)) captured[key] = value
  }
  return {
    reply: guarded.reply,
    dialect: detection.dialect,
    gulf: detection.gulf,
    arabizi: detection.arabizi,
    confidence: guarded.confidence,
    handoff: guarded.handoff,
    handoffReason: guarded.handoffReason,
    offTopic: guarded.offTopic,
    sources: chosen.map((chunk) => ({
      id: chunk.id,
      excerpt: chunk.content.slice(0, 240),
      similarity: Number(chunk.similarity.toFixed(4)),
    })),
    fields: captured,
  }
}
