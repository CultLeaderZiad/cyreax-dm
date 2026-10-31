import { getSupabaseBypassClient } from "@/lib/supabase-server"

// Defaulting to 300 requests per user per day to protect Groq rate limits.
const MAX_AI_CALLS_PER_DAY = 300

// Maps internal AI feature names to agent catalog keys (scripts/32-schema-agents-system.sql)
// so agent-level provider config + BYOK keys are applied to the right features.
const FEATURE_TO_AGENT_KEY: Record<string, string> = {
  auto_reply: "send_trigger_replies",
  sentiment_analysis: "comment_themes",
  analyze_themes: "comment_themes",
  analyze_faqs: "faq_detector",
  growth_insights: "weekly_coach_digest",
  analytics_summary: "weekly_coach_digest",
}

export class GroqRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GroqRateLimitError"
  }
}

export class GroqAPIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "GroqAPIError"
    this.status = status
  }
}

export interface GroqMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface GroqCompletionRequest {
  model?: string
  messages: GroqMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: "json_object" }
}

// In-memory short-lived budget cache to avoid DB exhaustion under high concurrency
const aiUsageCache = new Map<string, { count: number; expiresAt: number }>()

export async function checkAILimit(userId: number | string): Promise<boolean> {
  const cacheKey = String(userId)
  const now = Date.now()
  const cached = aiUsageCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.count < MAX_AI_CALLS_PER_DAY
  }

  const supabase = await getSupabaseBypassClient()
  
  // Count usage for today
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", today.toISOString())

  if (error) {
    console.error("[groq-client] Error checking AI limit (failing closed to prevent unbounded spend):", error)
    return false // Fail closed on DB error
  }

  const currentCount = count || 0
  aiUsageCache.set(cacheKey, { count: currentCount, expiresAt: now + 30_000 })
  return currentCount < MAX_AI_CALLS_PER_DAY
}

export async function logAIUsage(
  userId: number | string,
  feature: string,
  model: string,
  tokensUsed: number
) {
  const cacheKey = String(userId)
  const cached = aiUsageCache.get(cacheKey)
  if (cached) {
    cached.count += 1
  }

  try {
    const supabase = await getSupabaseBypassClient()
    const { error } = await supabase.from("ai_usage_log").insert({
      user_id: userId,
      feature,
      model,
      tokens_used: tokensUsed,
    })
    if (error) {
      console.debug("[groq-client] Skipping AI usage log (table might not exist):", error.message)
    }
  } catch (err) {
    console.error("[groq-client] Exception logging AI usage:", err)
  }
}

/**
 * Calls the Groq API if the user has not exceeded their daily limit.
 * Automatically logs the usage to `ai_usage_log`.
 */
/**
 * Calls the LLM API if the user has not exceeded their daily limit.
 * Automatically logs the usage to `ai_usage_log`.
 *
 * Now delegates to lib/llm-provider's generateCompletion so that per-agent
 * provider config + BYOK keys are honored for EVERY AI feature (previously
 * only 2 routes used the provider router; everything else silently bypassed
 * BYOK and always billed the managed Groq key).
 */
export async function generateGroqCompletion(
  userId: number | string,
  feature: string,
  options: GroqCompletionRequest
): Promise<string | null> {
  // NOTE: rate-limit + provider resolution all happen inside generateCompletion.
  // Do NOT duplicate those checks here (double DB round-trips per AI call), and
  // do NOT hard-fail when no *managed* key exists — the account may have a BYOK
  // key configured, which the provider layer resolves.
  const { generateCompletion } = await import("./llm-provider")
  const agentKey = FEATURE_TO_AGENT_KEY[feature] || feature
  return generateCompletion(String(userId), String(userId), feature, agentKey, options)
}
