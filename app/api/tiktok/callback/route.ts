export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, loadWorkspaceContext } from "@/lib/auth"
import { oauthCookieOptions, safeEqual } from "@/lib/instagram-oauth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { sealAccessToken } from "@/lib/token-crypto"
import { TIKTOK_API_BASE, tiktokAppId, tiktokAppSecret, tiktokMessagingEnabled } from "@/lib/tiktok/config"
import { commentToMessageAllowed, normalizeRegion } from "@/lib/tiktok/region"
import { exchangeTikTokCode, tiktokTokenExpiry, TT_OAUTH_STATE_COOKIE } from "@/lib/tiktok/oauth"
import { assertChannelConnect, PlanLimitError } from "@/lib/billing/enforce"

function fail(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/dashboard/connected-platforms?error=${error}`, request.url))
  response.cookies.set(TT_OAUTH_STATE_COOKIE, "", oauthCookieOptions(0))
  return response
}

async function tiktokGet(accessToken: string, path: string): Promise<any> {
  const response = await fetch(`${TIKTOK_API_BASE}${path}`, {
    headers: { "Access-Token": accessToken },
    cache: "no-store",
  })
  return response.json().catch(() => null)
}

async function tiktokPost(accessToken: string, path: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return response.json().catch(() => null)
}

/**
 * GET /api/tiktok/callback
 * Checks the OAuth state cookie, exchanges the code, and stores one TikTok
 * Business Account on the active workspace. The refresh token is sealed in
 * its own column and is not copied into metadata.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if (params.get("error")) return fail(request, "tiktok_denied")
  if (!tiktokMessagingEnabled()) return fail(request, "tiktok_disabled")

  const code = params.get("code")
  const state = params.get("state")
  const expected = request.cookies.get(TT_OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !expected || !safeEqual(state, expected)) return fail(request, "oauth_state")

  const session = await loadWorkspaceContext(request)
  if (!session) return fail(request, "not_logged_in")
  if (session.denied || forbidBelow(session.account.workspace_role, "admin")) return fail(request, "forbidden")

  const exchanged = await exchangeTikTokCode(code)
  if (!exchanged.ok || !exchanged.token.openId) return fail(request, "tiktok_token")

  const token = exchanged.token
  const profileFields = ["username", "display_name", "region", "country", "country_code"]
  let profile = await tiktokGet(
    token.accessToken,
    `/business/get/?business_id=${encodeURIComponent(token.openId)}&fields=${encodeURIComponent(JSON.stringify(profileFields))}`,
  )
  if (profile?.code !== undefined && profile.code !== 0) {
    profile = await tiktokGet(
      token.accessToken,
      `/business/get/?business_id=${encodeURIComponent(token.openId)}&fields=${encodeURIComponent(JSON.stringify(["username", "display_name"]))}`,
    )
  }
  const business = profile?.data || {}
  const username = business.username ? String(business.username) : null
  const displayName = business.display_name ? String(business.display_name) : username
  const region = normalizeRegion(business.region || business.country || business.country_code)

  const origin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  let dmWebhookSubscribed = false
  let commentWebhookSubscribed = false
  if (origin && tiktokAppId() && tiktokAppSecret()) {
    const subscribed = await tiktokPost(token.accessToken, "/business/webhook/update/", {
      app_id: tiktokAppId(),
      secret: tiktokAppSecret(),
      event_type: "DIRECT_MESSAGE",
      callback_url: `${origin}/api/tiktok/webhook`,
    })
    dmWebhookSubscribed = subscribed?.code === 0
    const commentHook = await tiktokPost(token.accessToken, "/business/webhook/update/", {
      app_id: tiktokAppId(),
      secret: tiktokAppSecret(),
      event_type: "COMMENT",
      callback_url: `${origin}/api/tiktok/webhook`,
    })
    commentWebhookSubscribed = commentHook?.code === 0
  }
  const webhookSubscribed = dmWebhookSubscribed

  let commentToDm = false
  if (region && commentToMessageAllowed(region)) {
    const enabled = await tiktokPost(token.accessToken, "/business/message/direct_reply/update/", {
      business_id: token.openId,
      direct_reply_type: "COMMENT_TO_MESSAGE",
      operation_status: "ENABLE",
    })
    commentToDm = enabled?.code === 0
  }

  const supabase = await getSupabaseBypassClient()
  let profileRow = null
  try {
    const { resolveWorkspaceProfile } = await import("@/lib/tenant-user")
    profileRow = session.workspace?.id ? await resolveWorkspaceProfile(supabase, session.workspace.id) : null
  } catch {
    profileRow = null
  }
  if (!profileRow?.id) {
    try {
      profileRow = await ensureTenantProfile(supabase, session.account, "workspace_managed", session.workspace?.id)
    } catch (error) {
      console.error("[tiktok] profile:", error)
      return fail(request, "server_error")
    }
  }

  try {
    await assertChannelConnect(supabase, session.account, { platform: "tiktok", pageId: token.openId })
  } catch (error) {
    if (error instanceof PlanLimitError) return fail(request, "limit_channels")
    throw error
  }

  const metadata: Record<string, unknown> = {
    username,
    name: displayName || username || token.openId,
    scope: token.scope,
    webhook_subscribed: webhookSubscribed,
    dm_webhook_subscribed: dmWebhookSubscribed,
    comment_webhook_subscribed: commentWebhookSubscribed,
    comment_to_dm: commentToDm,
  }
  if (region) metadata.region = region
  const fields: Record<string, unknown> = {
    user_id: profileRow.id,
    account_id: session.account.id,
    platform: "tiktok",
    page_id: token.openId,
    external_account_id: token.openId,
    access_token: sealAccessToken(token.accessToken),
    refresh_token: token.refreshToken ? sealAccessToken(token.refreshToken) : null,
    token_expires_at: tiktokTokenExpiry(token.expiresIn),
    metadata,
    workspace_id: session.workspace?.id || profileRow.workspace_id || null,
  }

  const { data: existing } = await supabase
    .from("platform_connections")
    .select("id")
    .eq("platform", "tiktok")
    .eq("page_id", token.openId)
    .maybeSingle()
  let write = existing
    ? await supabase.from("platform_connections").update(fields).eq("id", existing.id)
    : await supabase.from("platform_connections").insert(fields)
  if (write.error && /refresh_token|token_expires_at|workspace_id|account_id|external_account_id/i.test(write.error.message || "")) {
    delete fields.refresh_token
    delete fields.token_expires_at
    delete fields.workspace_id
    delete fields.account_id
    delete fields.external_account_id
    write = existing
      ? await supabase.from("platform_connections").update(fields).eq("id", existing.id)
      : await supabase.from("platform_connections").insert(fields)
  }
  if (write.error) {
    console.error("[tiktok] save:", write.error)
    return fail(request, "server_error")
  }

  const response = NextResponse.redirect(new URL("/dashboard/connected-platforms?success=tiktok", request.url))
  response.cookies.set(TT_OAUTH_STATE_COOKIE, "", oauthCookieOptions(0))
  return response
}
