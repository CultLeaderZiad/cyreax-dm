export const dynamic = 'force-dynamic'

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"

/**
 * GET /api/notifications
 * Lists recent notifications for the authenticated user's workspace, plus unread count.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if (auth.response) return auth.response
    const { user: account } = auth

    const supabase = await getSupabaseBypassClient()
    const workspaceId = account.workspace_id || account.active_workspace_id

    let query = supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30)

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    } else {
      query = query.eq("account_id", account.id)
    }

    const { data: notifications, error } = await query

    if (error) {
      const msg = error.message || ""
      if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find/i.test(msg)) {
        return NextResponse.json({ notifications: [], unread_count: 0 })
      }
      throw error
    }

    // Unread count
    let countQuery = supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)

    if (workspaceId) {
      countQuery = countQuery.eq("workspace_id", workspaceId)
    } else {
      countQuery = countQuery.eq("account_id", account.id)
    }

    const { count, error: countError } = await countQuery
    if (countError && countError.code !== "42P01" && countError.code !== "PGRST205") {
      console.warn("[notifications] unread count error:", countError.message)
    }

    return NextResponse.json({
      notifications: notifications || [],
      unread_count: count ?? (notifications || []).filter((n: any) => !n.read_at).length,
    })
  } catch (error: any) {
    console.error("[notifications] GET error:", error?.message)
    return NextResponse.json(
      { error: "Failed to fetch notifications", notifications: [], unread_count: 0 },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications
 * Marks one or all notifications as read.
 * Body: { id?: string, all?: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if (auth.response) return auth.response
    const { user: account } = auth

    const body = await request.json().catch(() => ({}))
    const supabase = await getSupabaseBypassClient()
    const workspaceId = account.workspace_id || account.active_workspace_id

    const now = new Date().toISOString()

    if (body.all) {
      let query = supabase
        .from("notifications")
        .update({ read_at: now })
        .is("read_at", null)

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId)
      } else {
        query = query.eq("account_id", account.id)
      }

      const { error } = await query
      if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error
    } else if (body.id) {
      let query = supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("id", body.id)

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId)
      } else {
        query = query.eq("account_id", account.id)
      }

      const { error } = await query
      if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error
    } else {
      return NextResponse.json({ error: "Missing notification id or all flag" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[notifications] PATCH error:", error?.message)
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 })
  }
}
