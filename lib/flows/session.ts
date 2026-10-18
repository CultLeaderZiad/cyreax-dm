import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { ensureTenantProfile } from "@/lib/tenant-user"

export async function workspaceSession(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return { response: result.response as NextResponse }
  
  const supabase = await getSupabaseBypassClient()
  let userId = result.igUser?.id

  if (!userId && result.user) {
    try {
      const profile = await ensureTenantProfile(
        supabase,
        result.user,
        "workspace_managed",
        result.workspace?.id
      )
      userId = profile?.id
    } catch (e) {
      console.warn("[workspaceSession] Failed to auto-provision profile, falling back to account id:", e)
      userId = result.user.id
    }
  }

  if (!userId) {
    return { response: NextResponse.json({ error: "No workspace profile found" }, { status: 400 }) }
  }

  return {
    supabase,
    userId,
    workspaceId: result.workspace?.id || result.igUser?.workspace_id || null,
  }
}

export function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table/i.test(message)
}
