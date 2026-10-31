export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { forbidBelow, loadWorkspaceContext } from "@/lib/auth"
import { sealAccessToken } from "@/lib/token-crypto"
import { resolveTenantProfile } from "@/lib/tenant-user"
import { FACEBOOK_GRAPH_BASE } from "@/lib/graph"
import { assertChannelConnect, PlanLimitError } from "@/lib/billing/enforce"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  // Diagnostic logging — capture everything Facebook sends back
  const allParams: Record<string, string> = {}
  searchParams.forEach((value, key) => { allParams[key] = value })
  console.log("[FB Callback] Incoming query params:", JSON.stringify(allParams))

  if (error) {
    const errorReason = searchParams.get("error_reason") || "unknown"
    const errorDescription = searchParams.get("error_description") || "none"
    console.error(`[FB Callback] OAuth error: ${error} | reason: ${errorReason} | description: ${errorDescription}`)
    const redirectUrl = new URL("/dashboard/connected-platforms?error=" + encodeURIComponent(error), request.url)
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 })
  }

  const session = await loadWorkspaceContext(request)
  if (!session) {
    return NextResponse.redirect(new URL("/?error=not_logged_in", request.url))
  }
  if (session.denied || forbidBelow(session.account.workspace_role, "admin")) {
    return NextResponse.redirect(new URL("/dashboard/connected-platforms?error=forbidden", request.url))
  }
  const account = session.account

  const supabase = await getSupabaseBypassClient()

  let userProfile = session.igUser
  try {
    if (!userProfile && session.workspace?.id) {
      userProfile = await resolveTenantProfile(supabase, session.workspace.ownerAccountId, session.workspace.id)
    } else if (!userProfile) {
      userProfile = await resolveTenantProfile(supabase, account.id)
    }
  } catch (error) {
    console.error("[FB Callback] Could not load profile:", error)
  }
  if (!userProfile) {
    try {
      const { ensureTenantProfile } = await import("@/lib/tenant-user")
      userProfile = await ensureTenantProfile(supabase, account, "facebook_managed", session.workspace?.id)
    } catch (e) {
      console.error("[FB Callback] Could not create tenant profile:", e)
      return NextResponse.redirect(new URL("/dashboard/connected-platforms?error=profile_create_failed", request.url))
    }
  }

  // IPQualityScore (IPQS) Graceful Lookup
  const ipqsKey = process.env.IPQS_API_KEY
  if (ipqsKey) {
    const signupIp = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || request.headers.get("x-real-ip")
    if (signupIp) {
      try {
        const ipqsRes = await fetch(`https://www.ipqualityscore.com/api/json/ip/${ipqsKey}/${signupIp}?strictness=1`)
        if (ipqsRes.ok) {
          const ipqsData = await ipqsRes.json()
          if (ipqsData.success) {
            const isVpn = ipqsData.vpn || ipqsData.proxy || ipqsData.tor
            const updates: any = {
              ip_risk_score: ipqsData.fraud_score,
              vpn_suspected: isVpn,
            }
            if (ipqsData.fraud_score > 85 || isVpn) {
              updates.is_flagged = true
              updates.flagged_reason = `High IP Risk on FB connect (${ipqsData.fraud_score}) or VPN used`
            }
            await supabase.from("users").update(updates).eq("id", userProfile.id)
          }
        }
      } catch (err) {
        console.error("[callback] FB IPQS lookup failed:", err)
      }
    }
  }

  // Trial limit check: max 1 platform connection (which is usually their IG)
  const { data: userDetails } = await supabase.from("users").select("plan").eq("id", userProfile.id).single()
  if (userDetails?.plan === "trial") {
    // We allow connecting Facebook pages because it's required to automate Instagram.
    // We will enforce the 1 platform limit at the automation rules level, not the connection level.
    console.log("[FB Callback] Trial user connecting Facebook - allowed because it's required for IG automation.")
  }

  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") || "https"
  const currentOrigin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "https://cyreax-dm.vercel.app")
  let redirectUri = `${currentOrigin}/api/facebook/callback`
  if (process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI && process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI.includes(host || "")) {
    redirectUri = process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI
  }

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("[FB Callback] Missing configuration: App ID, Secret, or Redirect URI is not set.")
    return NextResponse.json({ error: "Missing Facebook configuration in environment variables." }, { status: 500 })
  }

  try {
    // 1. Exchange Code for short token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenRes = await fetch(FACEBOOK_GRAPH_BASE + "/oauth/access_token?" + tokenParams.toString())
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/dashboard/connected-platforms?error=token_failed", request.url))
    }

    const shortToken = tokenData.access_token

    // 2. Exchange for long token (60 Days)
    const longLivedUrl = `${FACEBOOK_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortToken}`
    const longRes = await fetch(longLivedUrl)
    const longData = await longRes.json()
    const accessToken = longData.access_token || shortToken

    // 3. Get User Profile (/me) to capture Facebook ID and Name
    let meData: any = null
    try {
      const meRes = await fetch(`${FACEBOOK_GRAPH_BASE}/me?fields=id,name,picture&access_token=${accessToken}`)
      if (meRes.ok) {
        meData = await meRes.json()
        console.log("[FB Callback] /me response:", JSON.stringify(meData))
      }
    } catch (e) {
      console.warn("[FB Callback] /me fetch failed:", e)
    }

    // 4. Get Pages (Accounts) user manages with access tokens
    let pages: any[] = []
    try {
      const accountsUrl = `${FACEBOOK_GRAPH_BASE}/me/accounts?fields=id,name,category,access_token,tasks&limit=100&access_token=${accessToken}`
      let accountsRes = await fetch(accountsUrl)
      if (!accountsRes.ok) {
        accountsRes = await fetch(`${FACEBOOK_GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&limit=100&access_token=${accessToken}`)
      }
      if (!accountsRes.ok) {
        accountsRes = await fetch(`${FACEBOOK_GRAPH_BASE}/me/accounts?access_token=${accessToken}`)
      }
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json()
        if (Array.isArray(accountsData?.data)) {
          pages = accountsData.data
        }
      }
    } catch (e) {
      console.warn("[FB Callback] /me/accounts fetch failed:", e)
    }

    const savedAny: string[] = []
    let reachedLimit = false
    const eligiblePages: any[] = []

    // Filter pages that are allowed under the plan (don't abort the entire OAuth flow if one page exceeds plan limit)
    for (const page of pages) {
      const pageId = String(page.id)
      try {
        await assertChannelConnect(supabase, account, { platform: "facebook", pageId })
        eligiblePages.push(page)
      } catch (error) {
        if (error instanceof PlanLimitError) {
          reachedLimit = true
          console.warn(`[FB Callback] Channel limit reached; skipping Facebook page ${pageId} (${page.name})`)
          continue
        }
        console.warn(`[FB Callback] Error asserting page connect for ${pageId}:`, error)
        eligiblePages.push(page)
      }
    }

    const pageResults = await Promise.allSettled(
      eligiblePages.map(async (page: any) => {
        const pageId = String(page.id)
        const pageAccessToken = page.access_token || accessToken
        const storedPageToken = sealAccessToken(pageAccessToken)

        // Subscribe the Page to webhook events (best-effort)
        let webhookSubscribed = false
        if (pageAccessToken) {
          try {
            const subscribeUrl = new URL(`${FACEBOOK_GRAPH_BASE}/${pageId}/subscribed_apps`)
            subscribeUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks,feed")
            subscribeUrl.searchParams.set("access_token", pageAccessToken)
            const subRes = await fetch(subscribeUrl.toString(), { method: "POST" })
            const subData = await subRes.json()
            webhookSubscribed = !!(subRes.ok && subData.success)
          } catch (subErr) {
            console.warn(`[FB Callback] Webhook subscription error for page ${pageId}:`, subErr)
          }
        }

        const sharedMeta = {
          name: page.name,
          category: page.category || "Business",
          webhook_subscribed: webhookSubscribed,
          facebook_id: meData?.id ? String(meData.id) : pageId,
          is_user_profile: false,
          status: "active",
        }

        const upsert = async (platform: "facebook" | "messenger") => {
          const row = {
            user_id: userProfile.id,
            account_id: account.id,
            workspace_id: session.workspace?.id || null,
            platform,
            page_id: pageId,
            external_account_id: pageId,
            access_token: storedPageToken,
            metadata: sharedMeta,
          }
          const { data: existing } = await supabase.from("platform_connections")
            .select("id").eq("platform", platform).eq("page_id", pageId).maybeSingle()
          const res = existing
            ? await supabase.from("platform_connections").update(row).eq("id", existing.id)
            : await supabase.from("platform_connections").insert(row)
          if (res.error) throw new Error(`Upsert ${platform} failed: ${res.error.message}`)
        }

        await Promise.all([upsert("facebook"), upsert("messenger")])
        savedAny.push(pageId)
        return { pageId, webhookSubscribed }
      })
    )

    // Also ALWAYS save the Facebook User Account connection by Facebook ID
    if (meData?.id) {
      const fbUserId = String(meData.id)
      const fbUserName = meData.name || `Facebook User (${fbUserId})`
      const userMeta = {
        name: fbUserName,
        facebook_id: fbUserId,
        is_user_profile: true,
        webhook_subscribed: true,
        status: "active",
        picture: meData.picture?.data?.url || null,
      }
      const userRow = {
        user_id: userProfile.id,
        account_id: account.id,
        workspace_id: session.workspace?.id || null,
        platform: "facebook",
        page_id: fbUserId,
        external_account_id: fbUserId,
        access_token: sealAccessToken(accessToken),
        metadata: userMeta,
      }
      const { data: existingFbUser } = await supabase.from("platform_connections")
        .select("id").eq("platform", "facebook").eq("page_id", fbUserId).maybeSingle()
      if (existingFbUser) {
        await supabase.from("platform_connections").update(userRow).eq("id", existingFbUser.id)
      } else {
        await supabase.from("platform_connections").insert(userRow)
      }
      savedAny.push(fbUserId)
    }

    if (savedAny.length === 0) {
      return NextResponse.redirect(new URL("/dashboard/connected-platforms?error=no_facebook_profile", request.url))
    }

    const failures = pageResults.filter((r) => r.status === "rejected")
    if (failures.length > 0) {
      console.warn(`[FB Callback] ${failures.length}/${pageResults.length} pages failed to save`)
    }

    if (reachedLimit && eligiblePages.length === 0 && pages.length > 0) {
      return NextResponse.redirect(new URL("/dashboard/connected-platforms?warning=limit_channels", request.url))
    }

    return NextResponse.redirect(new URL("/dashboard/connected-platforms?success=1", request.url))
  } catch (error) {
    console.error("Facebook auth error:", error)
    return NextResponse.redirect(new URL("/dashboard/connected-platforms?error=server_error", request.url))
  }
}

