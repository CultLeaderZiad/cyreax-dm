import { GroqMessage, GroqCompletionRequest, checkAILimit, logAIUsage, GroqAPIError, GroqRateLimitError } from "./groq-client"
import { getSupabaseBypassClient } from "./supabase-server"
import { historyRole } from "./analytics-metrics"
import { BRAND } from "./brand"

// Check for required env vars for Cyreax DM managed models
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Default models per provider (only used when the request doesn't pin one).
// IMPORTANT: all four IDs below were verified against vendor deprecation pages
// (Sept 2026). The previous defaults were all RETIRED and returned 404s:
//   groq      llama-3.3-70b-versatile   -> retired 2026-08-16 (free/dev tier)
//   gemini    gemini-2.0-flash          -> shut down 2026-06-01
//   anthropic claude-3-5-haiku-latest    -> retired 2026-02-19
// Groq retires IDs with little notice, so GROQ_MODEL allows swapping without
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest"
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct"
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

/**
 * Normalizes an identifier to the accounts-table UUID.
 * Callers pass either the account UUID (dashboard API routes) or the int64
 * users.id (webhook handlers). account_agent_settings is keyed by account UUID,
 * so we must resolve users.id → accounts.id before BYOK/settings lookups.
 */
async function resolveAccountUuid(id: string | number): Promise<string> {
  const str = String(id)
  if (str.includes("-")) return str // already a UUID
  try {
    const supabase = await getSupabaseBypassClient()
    const { data } = await supabase.from("users").select("account_id").eq("id", str).maybeSingle()
    return data?.account_id || str
  } catch {
    return str
  }
}

/**
 * Checks whether an AI agent is enabled for an account. Fail-open: if the
 * tables/rows don't exist yet we allow the call so the feature still works,
 * but when a settings row exists and is_enabled = false the agent is skipped.
 * This makes the Agents dashboard toggles actually mean something.
 */
export async function isAgentEnabled(accountId: string | number, agentKey: string): Promise<boolean> {
  try {
    const accountUuid = await resolveAccountUuid(accountId)
    const supabase = await getSupabaseBypassClient()
    const { data: agent } = await supabase.from("agents").select("id").eq("agent_key", agentKey).maybeSingle()
    if (!agent) return true // Agent not in catalog — legacy feature, allow
    const { data: setting } = await supabase
      .from("account_agent_settings")
      .select("is_enabled")
      .eq("account_id", accountUuid)
      .eq("agent_id", agent.id)
      .maybeSingle()
    // No row = never configured. Default ON so features don't silently die
    // for users who never opened the Agents tab.
    if (!setting) return true
    return !!setting.is_enabled
  } catch {
    return true
  }
}

/** Marks an agent as used (feeds the "last activity" display per agent). */
export async function touchAgentUsage(accountId: string | number, agentKey: string) {
  try {
    const accountUuid = await resolveAccountUuid(accountId)
    const supabase = await getSupabaseBypassClient()
    const { data: agent } = await supabase.from("agents").select("id").eq("agent_key", agentKey).maybeSingle()
    if (!agent) return
    await supabase
      .from("account_agent_settings")
      .upsert(
        { account_id: accountUuid, agent_id: agent.id, last_used_at: new Date().toISOString() },
        { onConflict: "account_id,agent_id" }
      )
  } catch {
    // non-blocking
  }
}

// In a real implementation we would throw during module load or server startup if strictly required.
// But for graceful failure, we can check at runtime when the specific provider is called.

async function fetchByokKey(accountId: string, agentId: string): Promise<string | null> {
  const supabase = await getSupabaseBypassClient()
  const secret = process.env.BYOK_ENCRYPTION_SECRET
  if (!secret) return null

  const { data, error } = await supabase.rpc("get_agent_byok_key", {
    p_account_id: accountId,
    p_agent_id: agentId,
    p_secret: secret
  })

  if (error || !data) return null
  return data
}

export async function generateCompletion(
  userId: string,
  accountId: string,
  feature: string,
  agentKey: string,
  options: GroqCompletionRequest
): Promise<string | null> {

  // 0. Normalize: webhook callers pass the int64 users.id; settings/BYOK tables
  // are keyed by the account UUID.
  const accountUuid = await resolveAccountUuid(accountId)

  // 0b. Respect the Agents dashboard toggle — an agent the user switched OFF
  // must not run. Fail-open only when never configured.
  const agentEnabled = await isAgentEnabled(accountUuid, agentKey)
  if (!agentEnabled) {
    console.log(`[llm-provider] Agent "${agentKey}" is disabled for account ${accountUuid} — skipping ${feature}.`)
    return null
  }

  // 1. Check AI Limit for managed usage
  const isWithinLimit = await checkAILimit(userId)
  if (!isWithinLimit) {
    throw new GroqRateLimitError("AI limit exceeded for today.")
  }

  // 2. Fetch Agent Config — fall back to default Groq if agent row doesn't exist.
  // Also fetch the BYOK provider the user picked (if any) so we know WHICH
  // provider a stored BYOK key belongs to.
  const supabase = await getSupabaseBypassClient()
  const { data: agent, error: agentError } = await supabase.from("agents").select("id, provider, requires_byok").eq("agent_key", agentKey).single()

  // If agent not found or DB error, default to Groq directly (most common case)
  if (!agent || agentError) {
    console.warn(`[llm-provider] Agent "${agentKey}" not found in DB, defaulting to Groq provider. Error:`, agentError?.message || "not found")
    if (!GROQ_API_KEY) {
      throw new GroqAPIError(500, "GROQ_API_KEY is not configured. Please add it to your Vercel environment variables at https://vercel.com/dashboard.")
    }
    const responseText = await callGroqAPI(options, GROQ_API_KEY)
    if (responseText) {
      const estTokens = Math.floor(responseText.length / 4)
      await logAIUsage(userId, feature, "groq", estTokens)
    }
    return responseText
  }

  let apiKey: string | undefined
  let provider = agent.provider

  // 3. Resolve API Key — a user-provided BYOK key ALWAYS wins over managed keys
  const { data: byokSetting } = await supabase
    .from("account_agent_settings")
    .select("byok_provider, byok_connected_at")
    .eq("account_id", accountUuid)
    .eq("agent_id", agent.id)
    .maybeSingle()

  const byokKey = await fetchByokKey(accountUuid, agent.id)
  if (byokKey) {
    apiKey = byokKey
    if (byokSetting?.byok_provider) provider = byokSetting.byok_provider
  } else if (agent.requires_byok) {
    console.warn(`[llm-provider] BYOK key missing for agent "${agentKey}", falling back to Groq.`)
    if (!GROQ_API_KEY) {
      throw new GroqAPIError(500, "GROQ_API_KEY is not configured. Please add it to your Vercel environment variables at https://vercel.com/dashboard.")
    }
    const responseText = await callGroqAPI(options, GROQ_API_KEY)
    if (responseText) {
      const estTokens = Math.floor(responseText.length / 4)
      await logAIUsage(userId, feature, "groq", estTokens)
    }
    return responseText
  } else {
    // Cyreax DM Managed Keys
    if (provider === "groq") apiKey = GROQ_API_KEY
    if (provider === "gemini") apiKey = GEMINI_API_KEY
    if (provider === "openrouter") apiKey = OPENROUTER_API_KEY
    if (provider === "anthropic") apiKey = ANTHROPIC_API_KEY
    if (provider === "openai") apiKey = OPENAI_API_KEY
  }

  if (!apiKey) {
    // Fallback to Groq if the configured provider's key is missing
    console.warn(`[llm-provider] ${provider.toUpperCase()}_API_KEY missing, falling back to Groq.`)
    if (!GROQ_API_KEY) {
      throw new GroqAPIError(500, `${provider.toUpperCase()}_API_KEY is not configured and GROQ_API_KEY fallback is also missing. Please add GROQ_API_KEY to your Vercel environment variables at https://vercel.com/dashboard.`)
    }
    const responseText = await callGroqAPI(options, GROQ_API_KEY)
    if (responseText) {
      const estTokens = Math.floor(responseText.length / 4)
      await logAIUsage(userId, feature, "groq", estTokens)
    }
    return responseText
  }

  // 4. Execute based on Provider
  let responseText: string | null = null

  if (provider === "gemini") {
    try {
      responseText = await callGeminiAPI(options, apiKey)
    } catch (err: any) {
      console.warn(`[llm-provider] Gemini failed for ${feature}, falling back to Groq. Error:`, err.message)
      if (!GROQ_API_KEY) throw new GroqAPIError(500, "AI provider failed and no fallback available.")
      responseText = await callGroqAPI(options, GROQ_API_KEY)
      provider = "groq"
    }

  } else if (provider === "anthropic") {
    try {
      responseText = await callAnthropicAPI(options, apiKey)
    } catch (err: any) {
      console.warn(`[llm-provider] Anthropic failed for ${feature}, falling back to Groq. Error:`, err.message)
      if (!GROQ_API_KEY) throw new GroqAPIError(500, "AI provider failed and no fallback available.")
      responseText = await callGroqAPI(options, GROQ_API_KEY)
      provider = "groq"
    }

  } else if (provider === "openai") {
    try {
      responseText = await callOpenAIAPI(options, apiKey)
    } catch (err: any) {
      console.warn(`[llm-provider] OpenAI failed for ${feature}, falling back to Groq. Error:`, err.message)
      if (!GROQ_API_KEY) throw new GroqAPIError(500, "AI provider failed and no fallback available.")
      responseText = await callGroqAPI(options, GROQ_API_KEY)
      provider = "groq"
    }

  } else if (provider === "groq" || provider === "openrouter") {
    // Try Groq, fallback to OpenRouter
    try {
      responseText = await callGroqAPI(options, apiKey)
    } catch (err: any) {
      console.warn(`[llm-provider] Groq failed for ${feature}. Falling back to OpenRouter. Error:`, err.message)
      
      // Fallback to OpenRouter
      if (!OPENROUTER_API_KEY) {
        throw new GroqAPIError(500, "AI request failed and no fallback API key is configured.")
      }
      responseText = await callOpenRouterAPI(options, OPENROUTER_API_KEY)
      provider = "openrouter"
    }
  }

  // 5. Log usage + record agent activity (powers "last used" in the Agents UI)
  if (responseText) {
    const estTokens = Math.floor(responseText.length / 4)
    await logAIUsage(userId, feature, provider, estTokens)
    await touchAgentUsage(accountUuid, agentKey)
  }

  return responseText
}

// Low-level HTTP Callers

async function callGeminiAPI(options: GroqCompletionRequest, apiKey: string) {
  const model = options.model || DEFAULT_GEMINI_MODEL

  // Convert OpenAI-style messages to Gemini's contents format
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const msg of options.messages) {
    const role = msg.role === "assistant" ? "model" : "user"
    // Gemini expects alternating user/model roles.
    // If the last entry is already the same role, merge into it.
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += "\n" + msg.content
    } else {
      contents.push({ role, parts: [{ text: msg.content }] })
    }
  }

  const generationConfig: Record<string, unknown> = {}
  if (options.temperature != null) generationConfig.temperature = options.temperature
  if (options.max_tokens != null) generationConfig.maxOutputTokens = options.max_tokens
  if (options.response_format?.type === "json_object") {
    generationConfig.responseMimeType = "application/json"
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig })
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Gemini API Error: ${res.status} - ${txt}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error(`Gemini API returned no text. Response: ${JSON.stringify(data)}`)
  }
  return text
}

async function callGroqAPI(options: GroqCompletionRequest, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_GROQ_MODEL,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format
    })
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Groq API Error: ${res.status} - ${txt}`)
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || null
}

async function callOpenRouterAPI(options: GroqCompletionRequest, apiKey: string) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": BRAND.appUrl,
      "X-Title": BRAND.name,
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_OPENROUTER_MODEL, // OpenRouter model
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format
    })
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter API Error: ${res.status} - ${txt}`)
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || null
}

async function callAnthropicAPI(options: GroqCompletionRequest, apiKey: string) {
  // Anthropic Messages API: system prompt is a top-level field, not a message.
  const systemParts: string[] = []
  const messages: Array<{ role: "user" | "assistant"; content: string }> = []
  for (const msg of options.messages) {
    if (msg.role === "system") systemParts.push(msg.content)
    else messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content })
  }
  // Anthropic requires alternating roles starting with user; merge consecutive same-role messages
  const merged: Array<{ role: string; content: string }> = []
  for (const m of messages) {
    if (merged.length > 0 && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].content += "\n" + m.content
    } else {
      merged.push({ ...m })
    }
  }
  if (merged.length === 0) merged.push({ role: "user", content: "Hello" })

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: options.max_tokens ?? 1024,
    messages: merged,
  }
  if (systemParts.length > 0) body.system = systemParts.join("\n\n")
  if (options.temperature != null) body.temperature = options.temperature

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Anthropic API Error: ${res.status} - ${txt}`)
  }

  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
  if (!text) throw new Error(`Anthropic returned no text: ${JSON.stringify(data).slice(0, 300)}`)
  return text
}

async function callOpenAIAPI(options: GroqCompletionRequest, apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_OPENAI_MODEL,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenAI API Error: ${res.status} - ${txt}`)
  }

  const data = await res.json()
  return data.choices[0]?.message?.content || null
}

/**
 * Builds a message array with recent conversation history so AI auto-replies
 * have context instead of answering every DM in a vacuum (which is what made
 * the AI feel fake/hardcoded). Returns [system, ...history, currentUserMsg].
 */
export function buildConversationMessages(params: {
  systemPrompt: string
  history: Array<{ content: string; is_from_instagram?: boolean | null; direction?: string | null }>
  currentMessage: string
  maxHistory?: number
}): GroqMessage[] {
  const { systemPrompt, history, currentMessage, maxHistory = 8 } = params
  const msgs: GroqMessage[] = [{ role: "system", content: systemPrompt }]
  for (const h of history.slice(-maxHistory)) {
    if (!h.content || !h.content.trim()) continue
    msgs.push({
      role: historyRole(h),
      content: h.content.slice(0, 500),
    })
  }
  msgs.push({ role: "user", content: currentMessage })
  return msgs
}

/** Fetches the last N messages of a conversation for AI context. */
export async function fetchConversationHistory(
  conversationId: string | null | undefined,
  limit = 8
): Promise<Array<{ content: string; is_from_instagram?: boolean | null; direction?: string | null }>> {
  if (!conversationId) return []
  try {
    const supabase = await getSupabaseBypassClient()
    const withDirection = await supabase
      .from("messages")
      .select("content, is_from_instagram, direction")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (!withDirection.error) return (withDirection.data || []).reverse()
    const legacy = await supabase
      .from("messages")
      .select("content, is_from_instagram")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit)
    return (legacy.data || []).reverse()
  } catch {
    return []
  }
}
