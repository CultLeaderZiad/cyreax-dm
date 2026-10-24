export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { instagramNeedsReconnect } from "@/lib/instagram-token"
import { isPlaceholderToken, openAccessToken } from "@/lib/token-crypto"
import { metadataWithoutRegistrationPin } from "@/lib/whatsapp/embedded-signup"
import {
  releaseWhatsAppConnection,
  shouldUnsubscribeWaba,
  wabaIdFromConnection,
} from "@/lib/whatsapp/connect"

export async function GET(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const { user: account, igUser } = result

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await getSupabaseBypassClient()

  const connections: any[] = []

  // Surface Instagram connection if real Instagram account is connected
  if (igUser && (igUser.business_account_id || igUser.page_id || (igUser.access_token && !isPlaceholderToken(igUser.access_token)))) {
    connections.push({
      id: `ig_${igUser.id}`,
      platform: "instagram",
      page_id: igUser.business_account_id?.toString() || igUser.page_id?.toString() || "",
      metadata: { username: igUser.username || `user_${account.id}` },
      created_at: igUser.created_at,
      reconnect_required: instagramNeedsReconnect(igUser),
    })
  }

  // Fetch platform connections (Facebook, Telegram, WhatsApp, Messenger).
  //
  // IMPORTANT: platform_connections.user_id is BIGINT (users.id). This used to
  // pass [users.id, account UUID] in ONE .in() filter, which made PostgREST
  // return 400 "invalid input syntax for type bigint" and silently dropped
  // EVERY connection — Facebook showed "Not connected" forever even though a
  // saved row existed. Query each key separately (and let one failure be
  // isolated + logged instead of wiping the whole list), then merge:
  //   1. rows keyed by the int64 users.id
  //   2. rows keyed by account_id (legacy/newer flows; see migration 58)
  const queries: PromiseLike<{ data: any[] | null; error: any }>[] = []
  if (igUser?.id) {
    queries.push(
      supabase
        .from("platform_connections")
        .select("id, platform, page_id, metadata, connected_at")
        .in("user_id", [igUser.id])
    )
  }
  if (result.workspace?.id) {
    queries.push(
      supabase
        .from("platform_connections")
        .select("id, platform, page_id, metadata, connected_at")
        .eq("workspace_id", result.workspace.id)
    )
  }
  if (account?.id) {
    queries.push(
      supabase
        .from("platform_connections")
        .select("id, platform, page_id, metadata, connected_at")
        .eq("account_id", account.id)
    )
  }

  const perIdResults = await Promise.all(queries)

  const seenIds = new Set<string>()
  const rawConnections = perIdResults.flatMap((r) => {
    if (r.error) {
      console.error("Error fetching platform connections:", r.error)
    }
    return (r.data || []).filter((row) => {
      if (seenIds.has(row.id)) return false
      seenIds.add(row.id)
      return true
    })
  })

  for (const c of rawConnections || []) {
    connections.push({
      id: c.id,
      platform: c.platform,
      page_id: c.page_id,
      metadata: metadataWithoutRegistrationPin(c.metadata) || { name: c.page_id },
      created_at: c.connected_at,
    })
  }

  return NextResponse.json({ connections })
}

export async function DELETE(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const roleDenied = forbidBelow(result.user.workspace_role, "admin")
  if (roleDenied) return roleDenied
  const { user: account, igUser } = result

  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Accept the connection id from EITHER the query string (?id=...) or the
    // legacy body ({ id, platform }). Some clients pass both.
    const url = new URL(request.url)
    let connectionId = url.searchParams.get("id") || ""
    let platform = url.searchParams.get("platform") || ""

    if (!connectionId) {
      try {
        const body = await request.json()
        if (body && typeof body === "object") {
          connectionId = body.id || ""
          platform = body.platform || platform
        }
      } catch {
        // Body is optional if ?id= was supplied; ignore parse errors.
      }
    }

    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()

    // For Instagram, we can't disconnect (it's the primary account)
    if (platform === "instagram") {
      return NextResponse.json({ error: "Cannot disconnect your primary Instagram account" }, { status: 400 })
    }

    // Only the active workspace's profile. Another client workspace on the
    // same login has its own users.id and must not be disconnected from here.
    const ownedUserIds = new Set<string>()
    if (igUser?.id) ownedUserIds.add(String(igUser.id))

    // Ownership check WITHOUT mixing the account UUID into a user_id filter:
    // user_id is BIGINT, and a combined .in([uuid, ...]) makes PostgREST
    // return 400 "invalid input syntax for type bigint", which broke every
    // disconnect attempt with "Failed to disconnect".
    const { data: row, error: rowError } = await supabase
      .from("platform_connections")
      .select("id, user_id, account_id, platform, page_id, external_account_id, access_token, metadata")
      .eq("id", connectionId)
      .maybeSingle()

    const isOwner = row && (ownedUserIds.has(String(row.user_id)) || (account?.id && row.account_id === account.id))
    if (rowError || !row || !isOwner) {
      return NextResponse.json({ error: "Connection not found or does not belong to your account" }, { status: 404 })
    }

    if (row.platform === "whatsapp") {
      await releaseStoredWhatsApp(supabase, row)
    }

    const { error: deleteError } = await supabase
      .from("platform_connections")
      .delete()
      .eq("id", connectionId)

    if (deleteError) {
      console.error("Error disconnecting platform:", deleteError)
      return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

async function releaseStoredWhatsApp(supabase: any, row: any) {
  try {
    const token = openAccessToken(row.access_token)
    if (!token || isPlaceholderToken(token)) {
      console.error("[whatsapp] disconnect skipped Graph cleanup because the stored token could not be read")
      return
    }
    const wabaId = wabaIdFromConnection(row)
    let unsubscribe = false
    if (wabaId) {
      const { data: siblings, error: siblingError } = await supabase
        .from("platform_connections")
        .select("id, page_id, external_account_id, metadata")
        .eq("platform", "whatsapp")
        .eq("user_id", row.user_id)
        .neq("id", row.id)
      if (siblingError) {
        console.error("[whatsapp] could not check sibling numbers; leaving the WABA subscribed:", siblingError)
      } else {
        unsubscribe = shouldUnsubscribeWaba(
          (siblings || []).map((sibling: any) => wabaIdFromConnection(sibling)),
          wabaId,
        )
      }
    }
    await releaseWhatsAppConnection({
      accessToken: token,
      phoneNumberId: row.page_id ? String(row.page_id) : null,
      wabaId,
      unsubscribe,
    })
  } catch (error) {
    console.error("[whatsapp] disconnect cleanup failed:", error)
  }
}
