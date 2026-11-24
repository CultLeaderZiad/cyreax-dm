import { loadAccount, resolveAccountPlan } from "@/lib/billing/enforce"
import { featureEnabled } from "@/lib/billing/plans"
import { runAgent, type AgentResult, type LlmCall } from "./loop"
import { buildTools } from "./tools"
import type { ProposalRow } from "./proposals"

export class AgentNotInPlanError extends Error {
  constructor() {
    super("The AI Growth Agent is not included in your plan.")
    this.name = "AgentNotInPlanError"
  }
}

export async function assertAgentAccess(supabase: any, accountId: string) {
  const account = await loadAccount(supabase, accountId)
  if (!account) throw new AgentNotInPlanError()
  const plan = await resolveAccountPlan(supabase, account)
  if (!featureEnabled(plan, "aiAgent")) throw new AgentNotInPlanError()
}

/** Default model call: the provider chain (Gemini, then Groq) with the plan's monthly quota. */
export function providerLlm(accountId: string): LlmCall {
  return async (messages) => {
    const { generateGroqCompletion } = await import("@/lib/groq-client")
    return generateGroqCompletion(accountId, "growth_agent", { messages, temperature: 0.2, max_tokens: 700, response_format: { type: "json_object" } })
  }
}

export async function chatWithAgent(
  supabase: any,
  accountId: string,
  input: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> },
  llm: LlmCall = providerLlm(accountId),
): Promise<AgentResult & { proposals: ProposalRow[] }> {
  await assertAgentAccess(supabase, accountId)
  const proposals: ProposalRow[] = []
  const result = await runAgent({ message: input.message, history: input.history, tools: buildTools(supabase, accountId, proposals), llm })
  return { ...result, proposals }
}
