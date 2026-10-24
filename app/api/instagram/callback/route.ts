export const dynamic = 'force-dynamic'
import crypto from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { sealAccessToken } from "@/lib/token-crypto"
import { hasInstagramCredentials, resolveTenantProfile, resolveWorkspaceProfile } from "@/lib/tenant-user"
import { forbidBelow, loadWorkspaceContext } from "@/lib/auth"
import { INSTAGRAM_GRAPH_BASE } from "@/lib/graph"
import { assertChannelConnect, PlanLimitError } from "@/lib/billing/enforce"
import {
  IG_OAUTH_CODE_COOKIE,
  IG_OAUTH_STATE_COOKIE,
  instagramAppId,
  oauthCookieOptions,
  safeEqual,
} from "@/lib/instagram-oauth"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    const redirectUrl = new URL("/dashboard/connected-platforms", request.url)
    redirectUrl.searchParams.set("error", error)
    return NextResponse.redirect(redirectUrl)
  }

  const expectedState = request.cookies.get(IG_OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    const redirectUrl = new URL("/dashboard/connected-platforms", request.url)
    redirectUrl.searchParams.set("error", "oauth_state")
    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set(IG_OAUTH_STATE_COOKIE, "", oauthCookieOptions(0))
    return response
  }

  // Keep the authorization code in an httpOnly cookie. The browser never
  // posts it back, so a logged-in user cannot be tricked into exchanging
  // an attacker's code.
  const redirectUrl = new URL("/dashboard/connected-platforms", request.url)
  redirectUrl.searchParams.set("ig_oauth", "1")
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(IG_OAUTH_STATE_COOKIE, "", oauthCookieOptions(0))
  response.cookies.set(IG_OAUTH_CODE_COOKIE, code, oauthCookieOptions(5 * 60))
  return response
}

export async function POST(request: NextRequest) {
  const code = request.cookies.get(IG_OAUTH_CODE_COOKIE)?.value
  const clearCode = (response: NextResponse) => {
    response.cookies.set(IG_OAUTH_CODE_COOKIE, "", oauthCookieOptions(0))
    return response
  }
  if (!code) return NextResponse.json({ error: "No code" }, { status: 400 })

  try {

    // 1. Env Vars
    const clientId = instagramAppId()
    const clientSecret = process.env.INSTAGRAM_APP_SECRET
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || ""
    const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI || `${appUrl}/api/instagram/callback`

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("[instagram/callback] Missing env vars: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, or NEXT_PUBLIC_APP_URL")
      return clearCode(NextResponse.json({ error: "Instagram integration is not configured. Please contact support." }, { status: 503 }))
    }

    // 2. Exchange Code for Short Token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    })

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      if (tokenData.error_message?.includes("authorization code has been used")) {
        // Harmless double-fire from React StrictMode or double clicks
        return clearCode(NextResponse.json({ error: "Code already used" }, { status: 400 }))
      }
      console.error("[v0] 🔴 Token Error:", JSON.stringify(tokenData, null, 2))
      return clearCode(NextResponse.json({ error: tokenData.error_description || "Token failed" }, { status: 400 }))
    }

    const shortToken = tokenData.access_token
    const loginUserId = tokenData.user_id.toString()

    // 3. Exchange for Long Token (60 Days)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortToken}`
    const longRes = await fetch(longLivedUrl)
    const longData = await longRes.json()
    const accessToken = longData.access_token || shortToken
    const expiresIn = longData.expires_in || 5184000

    // 4. Get Username + IG Professional Account ID (webhook-matching ID)
    // Per Meta docs: /me?fields=user_id returns the IG_ID that matches webhook entry.id
    // https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
    let username = `user_${loginUserId}`
    let businessAccountId = loginUserId // fallback
    let profilePic: string | null = null

    try {
      const meRes = await fetch(
        `${INSTAGRAM_GRAPH_BASE}/me?fields=user_id,username,profile_picture_url&access_token=${accessToken}`
      )
      const meData = await meRes.json()
      console.log("[v0] 📋 /me response:", JSON.stringify(meData))

      if (meData.username) username = meData.username
      if (meData.profile_picture_url) profilePic = meData.profile_picture_url
      if (meData.user_id) {
        businessAccountId = meData.user_id.toString()
        console.log(`[v0] 🎯 Got IG Professional Account ID (user_id): ${businessAccountId}`)
      } else {
        console.warn(`[v0] ⚠️ /me did not return user_id, using loginUserId: ${loginUserId}`)
      }
    } catch (e) {
      console.error("[v0] /me request failed:", e)
    }

    // 5. Save/Update User — check if new vs returning user
    // DB reads/writes go through the RLS-bypass client (the session client below
    // is used only for auth.getUser()).
    const db = await getSupabaseBypassClient()

    // 5a. Attach Instagram to the workspace that is active for this login.
    const session = await loadWorkspaceContext(request)
    if (!session) {
      return clearCode(NextResponse.json({ error: "Not authenticated" }, { status: 401 }))
    }
    if (session.denied) {
      return clearCode(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    }
    const roleDenied = forbidBelow(session.account.workspace_role, "admin")
    if (roleDenied) return clearCode(roleDenied)

    const account = { id: session.account.id }
    const workspaceId = session.workspace?.id || null

    // A Facebook or Telegram connect may already have created a placeholder
    // users row for this workspace. Update that row in place.
    const existingUser = workspaceId
      ? await resolveWorkspaceProfile(db, workspaceId)
      : await resolveTenantProfile(db, account.id)
    const profileId = existingUser?.id ?? loginUserId
    const firstInstagramConnect = !existingUser || !hasInstagramCredentials(existingUser)
    if (firstInstagramConnect) {
      try {
        await assertChannelConnect(db, session.account, { kind: "instagram", businessAccountId: businessAccountId ? String(businessAccountId) : null })
      } catch (error) {
        if (error instanceof PlanLimitError) {
          return clearCode(NextResponse.json({ error: error.message, code: "limit_hard" }, { status: 402 }))
        }
        throw error
      }
    }

    const updates: any = {
      username,
      access_token: sealAccessToken(accessToken),
      reconnect_required: false,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      business_account_id: businessAccountId,
      page_id: businessAccountId, // Always keep in sync
      account_id: account.id,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    }

    // Only set signup_ip on the first Instagram connect for this account.
    if (firstInstagramConnect) {
      const signupIp = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
        || request.headers.get("x-real-ip")
        || null

      updates.signup_ip = signupIp

      if (signupIp) {
        // IP-based signup rate limiting — flag but don't hard-block (agencies/shared offices)
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { count: ipSignupCount } = await db
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("signup_ip", signupIp)
          .gte("created_at", since24h)

        const IP_RATE_LIMIT = 5
        if ((ipSignupCount ?? 0) >= IP_RATE_LIMIT) {
          updates.is_flagged = true
          updates.flagged_reason = `Signup IP rate limit: ${ipSignupCount} accounts from ${signupIp} in 24h`
          console.warn(`[callback] 🚩 IP rate limit hit for ${signupIp} — flagging new user ${username}`)
        }

        // IPQualityScore (IPQS) Graceful Lookup
        const ipqsKey = process.env.IPQS_API_KEY
        if (ipqsKey) {
          try {
            const ipqsRes = await fetch(`https://www.ipqualityscore.com/api/json/ip/${ipqsKey}/${signupIp}?strictness=1`)
            if (ipqsRes.ok) {
              const ipqsData = await ipqsRes.json()
              if (ipqsData.success) {
                updates.ip_risk_score = ipqsData.fraud_score
                updates.vpn_suspected = ipqsData.vpn || ipqsData.proxy || ipqsData.tor
                
                // Flag if risk is high or VPN is used (flag-only, no block)
                if (ipqsData.fraud_score > 85 || updates.vpn_suspected) {
                  updates.is_flagged = true
                  updates.flagged_reason = updates.flagged_reason 
                    ? `${updates.flagged_reason} | High IP Risk (${ipqsData.fraud_score}) or VPN used`
                    : `High IP Risk (${ipqsData.fraud_score}) or VPN used`
                }
              }
            }
          } catch (err) {
            console.error("[callback] IPQS lookup failed:", err)
          }
        }
      }
    }

    console.log(`[v0] 💾 Saving user: ${username} | id=${profileId} | biz_id=${businessAccountId}`)

    const saveProfile = async (fields: Record<string, unknown>) => {
      if (existingUser) {
        return db.from("users").update(fields).eq("id", profileId)
      }
      return db.from("users").upsert({ id: profileId, ...fields }, { onConflict: "id" })
    }

    let { error: upsertError } = await saveProfile(updates)
    if (upsertError && /reconnect_required|token_expires_at|workspace_id/i.test(upsertError.message || "")) {
      const reduced = { ...updates }
      if (/reconnect_required/i.test(upsertError.message || "")) delete reduced.reconnect_required
      if (/token_expires_at/i.test(upsertError.message || "")) delete reduced.token_expires_at
      if (/workspace_id/i.test(upsertError.message || "")) delete reduced.workspace_id
      const retry = await saveProfile(reduced)
      upsertError = retry.error
    }

    if (upsertError) throw upsertError

    // Also sync to platform_connections table for multi-channel consistency
    try {
      const igPlatformData: any = {
        user_id: profileId,
        account_id: account.id,
        platform: "instagram",
        page_id: businessAccountId,
        external_account_id: businessAccountId,
        access_token: sealAccessToken(accessToken),
        metadata: { username, profile_pic: profilePic, webhook_subscribed: true },
        workspace_id: workspaceId || null,
      }
      const { data: existingIgConn } = await db.from("platform_connections")
        .select("id").eq("platform", "instagram").eq("page_id", businessAccountId).maybeSingle()
      if (existingIgConn) {
        await db.from("platform_connections").update(igPlatformData).eq("id", existingIgConn.id)
      } else {
        await db.from("platform_connections").insert(igPlatformData)
      }
    } catch (e) {
      console.warn("[v0] Could not sync to platform_connections:", e)
    }

    // 6. Return response (no need for insta_session cookie, we use Supabase Auth now)
    const response = NextResponse.json({ success: true, username, userId: String(profileId), profilePic })
    return clearCode(response)

  } catch (error: any) {
    return clearCode(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

