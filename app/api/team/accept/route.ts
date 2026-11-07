export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { getSupabaseBypassClient, getSupabaseServerClient } from "@/lib/supabase-server"
import { workspaceRoleFromLegacy } from "@/lib/workspace-access"
import { addWorkspaceMember } from "@/lib/workspaces"

/**
 * POST /api/team/accept
 * Body: { id: string }
 * The invited account explicitly accepts a seat. Until this runs, status
 * stays `invited` and getSessionInstagramUser will not switch into the agency.
 */
export async function POST(request: NextRequest) {
  const result = await requireUser(request)
  if (result.response) return result.response

  // The invite is bound to an email address, so the caller must have proven
  // they own it. Without this, signing up with someone else's address (when
  // email confirmation is off) would be enough to take their seat.
  const { data: authData } = await (await getSupabaseServerClient()).auth.getUser()
  const authUser = authData?.user
  const email = authUser?.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "Your account has no email address" }, { status: 400 })
  if (!authUser?.email_confirmed_at) {
    return NextResponse.json({ error: "Confirm your email address before accepting an invite" }, { status: 403 })
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: "Missing invite id" }, { status: 400 })

  const supabase = await getSupabaseBypassClient()
  let inviteResult = await supabase
    .from("agency_team_members")
    .select("id, email, status, permission_level, workspace_id, agency_account_id")
    .eq("id", body.id)
    .maybeSingle()
  if (inviteResult.error && /workspace_id/i.test(inviteResult.error.message || "")) {
    inviteResult = await supabase
      .from("agency_team_members")
      .select("id, email, status, permission_level, agency_account_id")
      .eq("id", body.id)
      .maybeSingle()
  }
  const invite = inviteResult.data
  const error = inviteResult.error

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invite || invite.status !== "invited" || invite.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 })
  }

  const { data: updated, error: updateError } = await supabase
    .from("agency_team_members")
    .update({
      status: "active",
      member_account_id: result.user.id,
    })
    .eq("id", invite.id)
    .eq("status", "invited")
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  let workspaceId = invite.workspace_id as string | null
  if (!workspaceId && invite.agency_account_id) {
    const { data: owned } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_account_id", invite.agency_account_id)
      .order("created_at", { ascending: true })
      .limit(1)
    workspaceId = owned?.[0]?.id || null
  }
  if (workspaceId && updated.member_account_id) {
    try {
      await addWorkspaceMember(
        supabase,
        workspaceId,
        updated.member_account_id,
        workspaceRoleFromLegacy(invite.permission_level),
      )
    } catch (memberError) {
      console.warn("[team/accept] Could not add workspace member:", memberError)
    }
  }

  return NextResponse.json({ member: updated })
}
