export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { AgentNotInPlanError, chatWithAgent } from "@/lib/ai/agent/service"
import { AiQuotaError } from "@/lib/ai/quota"

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  if (session.user.permission_level === "viewer") return NextResponse.json({ error: "Viewers cannot use the agent." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  if (!message || message.length > 2_000) return NextResponse.json({ error: "Write a message of up to 2000 characters." }, { status: 400 })
  const history = Array.isArray(body?.history)
    ? body.history
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-10)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2_000) }))
    : []

  try {
    const supabase = await getSupabaseBypassClient()
    const out = await chatWithAgent(supabase, String(session.user.id), { message, history })
    return NextResponse.json({ reply: out.reply, proposals: out.proposals.map((p) => ({ id: p.id, summary: p.summary, status: p.status })), stopped: out.stopped })
  } catch (e: any) {
    if (e instanceof AgentNotInPlanError) return NextResponse.json({ error: e.message, code: "FEATURE_NOT_IN_PLAN" }, { status: 403 })
    if (e instanceof AiQuotaError || e?.name === "AiQuotaError") return NextResponse.json({ error: e.message, code: "AI_QUOTA_EXCEEDED" }, { status: 402 })
    console.error("[ai/agent]", e?.message || e)
    return NextResponse.json({ error: "The agent could not answer right now." }, { status: 500 })
  }
}
