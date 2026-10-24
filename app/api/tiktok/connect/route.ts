export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { sealAccessToken } from "@/lib/token-crypto"
import { assertChannelConnect, limitPayload, PlanLimitError } from "@/lib/billing/enforce"
import { normalizeRegion } from "@/lib/tiktok/region"

/**
 * POST /api/tiktok/connect
 * Connects a TikTok Business / Creator account for DM and comment automation.
 */
export async function POST(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const roleDenied = forbidBelow(result.user.workspace_role, "admin")
  if (roleDenied) return roleDenied
  const { user: account, igUser, workspace } = result

  let body: {
    username?: string
    account_id?: string
    region?: string
    access_token?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const rawUsername = body.username?.trim().replace(/^@/, "")
  if (!rawUsername) {
    return NextResponse.json({ error: "Please enter a valid TikTok username / handle" }, { status: 400 })
  }

  const normalizedUsername = `@${rawUsername}`
  const pageId = body.account_id?.trim() || `tt_${rawUsername.toLowerCase()}`
  const region = normalizeRegion(body.region || "EG") || "EG"

  const supabase = await getSupabaseBypassClient()

  try {
    await assertChannelConnect(supabase, account, { platform: "tiktok", pageId })
  } catch (error) {
    if (error instanceof PlanLimitError) return NextResponse.json(limitPayload(error), { status: 402 })
    throw error
  }

  let profile = igUser?.id ? igUser : null
  if (!profile) {
    try {
      profile = await ensureTenantProfile(supabase, account, "workspace_managed", workspace?.id)
    } catch (error) {
      console.error("[TikTok Connect] Could not prepare profile:", error)
      return NextResponse.json({ error: "Could not prepare account profile" }, { status: 500 })
    }
  }

  const storedToken = body.access_token?.trim()
    ? sealAccessToken(body.access_token.trim())
    : sealAccessToken(`tt_token_${pageId}`)

  const metadata = {
    username: rawUsername,
    name: normalizedUsername,
    region,
    webhook_subscribed: true,
    comment_to_dm: true,
  }

  const row = {
    user_id: profile.id,
    account_id: account.id,
    workspace_id: workspace?.id || null,
    platform: "tiktok",
    page_id: pageId,
    external_account_id: pageId,
    access_token: storedToken,
    metadata,
    is_active: true,
  }

  const { data: existing } = await supabase
    .from("platform_connections")
    .select("id")
    .eq("platform", "tiktok")
    .eq("page_id", pageId)
    .maybeSingle()

  const writeResult = existing
    ? await supabase.from("platform_connections").update(row).eq("id", existing.id)
    : await supabase.from("platform_connections").insert(row)

  if (writeResult.error) {
    console.error("[TikTok Connect] Save error:", writeResult.error)
    return NextResponse.json({ error: "Failed to save TikTok connection" }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    connection: {
      platform: "tiktok",
      username: normalizedUsername,
      page_id: pageId,
      region,
    },
  })
}
