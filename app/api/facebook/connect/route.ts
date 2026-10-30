export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { sealAccessToken } from "@/lib/token-crypto"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { FACEBOOK_GRAPH_BASE } from "@/lib/graph"
import { assertChannelConnect, limitPayload, PlanLimitError } from "@/lib/billing/enforce"

/**
 * POST /api/facebook/connect
 *
 * Saves a user-selected Facebook Page as a platform connection.
 * Called after the user picks a Page from the discover step.
 *
 * Steps:
 * 1. Fetch the definitive Page Access Token from the Graph API
 * 2. Subscribe the Page to the app's webhook events
 * 3. Upsert into platform_connections (facebook + messenger)
 */
export async function POST(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const roleDenied = forbidBelow(result.user.workspace_role, "admin")
  if (roleDenied) return roleDenied
  const { user: account, igUser, workspace } = result

  let body: {
    page_id?: string
    _token?: string
    session_id?: string
    page_token?: string
    name?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { page_id, _token, session_id } = body
  if (!page_id) {
    return NextResponse.json({ error: "Missing page_id in body" }, { status: 400 })
  }

  const supabase = await getSupabaseBypassClient()
  try {
    await assertChannelConnect(supabase, account, { platform: "facebook", pageId: page_id })
  } catch (error) {
    if (error instanceof PlanLimitError) return NextResponse.json(limitPayload(error), { status: 402 })
    throw error
  }

  // Resolve the user access token. Preferred path: server-side OAuth session.
  // Fallbacks: body._token, body.page_token, or an existing Facebook connection for this account.
  let userAccessToken = _token || body.page_token || ""

  if (session_id) {
    const { data: session } = await supabase
      .from("oauth_sessions")
      .select("id, token_encrypted, expires_at, account_id, provider")
      .eq("id", session_id)
      .eq("provider", "facebook")
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ error: "Session expired or not found. Please click Connect Facebook again." }, { status: 400 })
    }
    if (session.account_id !== account.id) {
      return NextResponse.json({ error: "Session does not belong to this account" }, { status: 403 })
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Session expired. Please click Connect Facebook again." }, { status: 400 })
    }

    const { decryptString } = await import("@/lib/crypto")
    const decrypted = decryptString(session.token_encrypted)
    if (!decrypted) {
      return NextResponse.json({ error: "Failed to read session. Please try connecting again." }, { status: 500 })
    }
    userAccessToken = decrypted

    // One-time use: burn the session immediately after reading it
    await supabase.from("oauth_sessions").delete().eq("id", session.id)
  }

  if (!userAccessToken) {
    const { data: existingUserConn } = await supabase
      .from("platform_connections")
      .select("access_token")
      .eq("account_id", account.id)
      .eq("platform", "facebook")
      .maybeSingle()
    if (existingUserConn?.access_token) {
      try {
        const { openAccessToken } = await import("@/lib/token-crypto")
        userAccessToken = openAccessToken(existingUserConn.access_token) || ""
      } catch (err) {
        console.warn("[FB Connect] Failed to open existing Facebook token:", err)
      }
    }
  }

  let profile = igUser?.id ? igUser : null
  if (!profile) {
    try {
      profile = await ensureTenantProfile(supabase, account, "facebook_managed", workspace?.id)
    } catch (error) {
      console.error("[FB Connect] Could not prepare profile:", error)
      return NextResponse.json({ error: "Could not prepare an account profile" }, { status: 500 })
    }
  }
  const userId = profile.id

  try {
    // 1. Fetch the Page Access Token + metadata for the specific page
    let pageAccessToken = body.page_token || ""
    let pageName = body.name || `Facebook Page (${page_id})`
    let pageCategory = "Business"
    let status = "active"

    if (userAccessToken && !body.page_token) {
      const pageUrl = new URL(`${FACEBOOK_GRAPH_BASE}/${page_id}`)
      pageUrl.searchParams.set("fields", "access_token,name,category")
      pageUrl.searchParams.set("access_token", userAccessToken)

      const pageRes = await fetch(pageUrl.toString())
      const pageData = await pageRes.json()

      if (pageRes.ok && pageData.access_token) {
        pageAccessToken = pageData.access_token
        pageName = pageData.name || pageName
        pageCategory = pageData.category || pageCategory
      } else {
        console.warn("[FB Connect] Graph API page token fetch note:", pageData?.error?.message || "Pending approval")
        status = "pending_confirmation"
      }
    }

    const storedPageToken = pageAccessToken
      ? sealAccessToken(pageAccessToken)
      : sealAccessToken("facebook_managed")

    // 2. Subscribe the Page to webhook events (best-effort — don't block on failure)
    let webhookSubscribed = false
    if (pageAccessToken) {
      try {
        const subscribeUrl = new URL(`${FACEBOOK_GRAPH_BASE}/${page_id}/subscribed_apps`)
        subscribeUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks,feed")
        subscribeUrl.searchParams.set("access_token", pageAccessToken)

        const subRes = await fetch(subscribeUrl.toString(), { method: "POST" })
        const subData = await subRes.json()

        if (subRes.ok && subData.success) {
          webhookSubscribed = true
          console.log(`[FB Connect] Webhook subscription successful for page ${page_id}`)
        } else {
          console.warn(`[FB Connect] Webhook subscription failed for page ${page_id}:`, subData)
        }
      } catch (subError) {
        console.warn(`[FB Connect] Webhook subscription error for page ${page_id}:`, subError)
      }
    }

    // 3. Upsert into platform_connections with workspace and account association
    const sharedMeta = {
      name: pageName,
      category: pageCategory,
      webhook_subscribed: webhookSubscribed,
      status,
      associated_account_id: account.id,
      associated_user: account.email || account.full_name || "thezmythz",
    }

    const fbData = {
      user_id: userId,
      account_id: account.id,
      workspace_id: workspace?.id || null,
      platform: "facebook",
      page_id: String(page_id),
      external_account_id: String(page_id),
      access_token: storedPageToken,
      metadata: sharedMeta,
      is_active: true,
    }
    
    const { data: existingFb } = await supabase.from("platform_connections")
      .select("id").eq("platform", "facebook").eq("page_id", String(page_id)).maybeSingle()
      
    let fbResult;
    if (existingFb) {
      fbResult = await supabase.from("platform_connections").update(fbData).eq("id", existingFb.id)
    } else {
      fbResult = await supabase.from("platform_connections").insert(fbData)
    }

    if (fbResult.error) {
      console.error("[FB Connect] Failed to upsert facebook connection:", fbResult.error)
      throw new Error("Failed to save Facebook connection: " + fbResult.error.message)
    }

    // Also create a messenger connection with the same token (matches old callback behavior)
    const msgData = {
      user_id: userId,
      account_id: account.id,
      workspace_id: workspace?.id || null,
      platform: "messenger",
      page_id: String(page_id),
      external_account_id: String(page_id),
      access_token: storedPageToken,
      metadata: sharedMeta,
      is_active: true,
    }
    
    const { data: existingMsg } = await supabase.from("platform_connections")
      .select("id").eq("platform", "messenger").eq("page_id", String(page_id)).maybeSingle()
      
    let msgResult;
    if (existingMsg) {
      msgResult = await supabase.from("platform_connections").update(msgData).eq("id", existingMsg.id)
    } else {
      msgResult = await supabase.from("platform_connections").insert(msgData)
    }

    if (msgResult.error) {
      console.error("[FB Connect] Failed to upsert messenger connection:", msgResult.error)
      // Don't throw — FB connection was saved, messenger is secondary
    }

    console.log(`[FB Connect] Successfully connected page ${page_id} (${pageName}) for user ${userId}`)

    return NextResponse.json({
      success: true,
      page: { id: page_id, name: pageName },
      webhook_subscribed: webhookSubscribed,
    })
  } catch (error) {
    console.error("[FB Connect] Unexpected error:", error)
    return NextResponse.json({ error: "Something went wrong connecting to Facebook. Please try again." }, { status: 500 })
  }
}

