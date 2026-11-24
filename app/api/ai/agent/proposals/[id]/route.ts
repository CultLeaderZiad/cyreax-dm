export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { assertAgentAccess, AgentNotInPlanError } from "@/lib/ai/agent/service"
import { decideProposal } from "@/lib/ai/agent/proposals"

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  if (session.user.permission_level === "viewer") return NextResponse.json({ error: "Viewers cannot change automations." }, { status: 403 })
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown proposal" }, { status: 400 })
  const body = await request.json().catch(() => null)
  const decision = body?.decision === "confirm" ? "confirm" : body?.decision === "dismiss" ? "dismiss" : null
  if (!decision) return NextResponse.json({ error: "decision must be confirm or dismiss" }, { status: 400 })

  try {
    const supabase = await getSupabaseBypassClient()
    await assertAgentAccess(supabase, String(session.user.id))
    const row = await decideProposal(supabase, String(session.user.id), id, decision)
    if (!row) return NextResponse.json({ error: "This suggestion was already handled or does not exist." }, { status: 409 })
    return NextResponse.json({ id: row.id, status: row.status, result: row.result })
  } catch (e: any) {
    if (e instanceof AgentNotInPlanError) return NextResponse.json({ error: e.message, code: "FEATURE_NOT_IN_PLAN" }, { status: 403 })
    console.error("[ai/agent/proposals]", e?.message || e)
    return NextResponse.json({ error: "Could not apply this suggestion." }, { status: 500 })
  }
}
