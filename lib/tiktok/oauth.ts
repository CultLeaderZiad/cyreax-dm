import { TIKTOK_API_BASE, TIKTOK_OAUTH_SCOPES, tiktokAppId, tiktokAppSecret, tiktokRedirectUri } from "@/lib/tiktok/config"
import type { FetchLike } from "@/lib/channels/types"
import { defaultFetch } from "@/lib/channels/http"
import { openAccessToken, sealAccessToken } from "@/lib/token-crypto"

export interface TikTokToken {
  accessToken: string
  refreshToken: string
  openId: string
  scope: string
  expiresIn: number
  refreshExpiresIn: number
}

export const TT_OAUTH_STATE_COOKIE = "tt_oauth_state"

export function tiktokAuthorizeUrl(state: string): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/")
  url.searchParams.set("client_key", tiktokAppId())
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", TIKTOK_OAUTH_SCOPES.join(","))
  url.searchParams.set("redirect_uri", tiktokRedirectUri())
  url.searchParams.set("state", state)
  return url.toString()
}

async function tokenCall(
  fetchImpl: FetchLike,
  path: string,
  body: Record<string, string>,
): Promise<{ ok: true; token: TikTokToken } | { ok: false; error: string }> {
  const response = await fetchImpl(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  if (!json || json.code !== 0 || !json.data?.access_token) {
    return { ok: false, error: json?.message || "TikTok token request failed" }
  }
  return {
    ok: true,
    token: {
      accessToken: String(json.data.access_token),
      refreshToken: String(json.data.refresh_token || ""),
      openId: String(json.data.open_id || ""),
      scope: String(json.data.scope || ""),
      expiresIn: Number(json.data.expires_in) || 86400,
      refreshExpiresIn: Number(json.data.refresh_token_expires_in) || 0,
    },
  }
}

/** POST /tt_user/oauth2/token/ — short-lived token, about one day. */
export function exchangeTikTokCode(code: string, fetchImpl: FetchLike = defaultFetch()) {
  return tokenCall(fetchImpl, "/tt_user/oauth2/token/", {
    client_id: tiktokAppId(),
    client_secret: tiktokAppSecret(),
    grant_type: "authorization_code",
    auth_code: code,
    redirect_uri: tiktokRedirectUri(),
  })
}

/** POST /tt_user/oauth2/refresh_token/ — refresh token lasts about one year. */
export function refreshTikTokToken(refreshToken: string, fetchImpl: FetchLike = defaultFetch()) {
  return tokenCall(fetchImpl, "/tt_user/oauth2/refresh_token/", {
    client_id: tiktokAppId(),
    client_secret: tiktokAppSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
}

export function tiktokTokenExpiry(expiresInSeconds: number, now = Date.now()): string {
  return new Date(now + Math.max(60, expiresInSeconds) * 1000).toISOString()
}

export function tiktokTokenNeedsRefresh(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true
  const at = Date.parse(expiresAt)
  if (!Number.isFinite(at)) return true
  return at - now < 2 * 60 * 60 * 1000
}

export async function refreshTikTokTokens(
  supabase: any,
  fetchImpl: FetchLike = defaultFetch(),
): Promise<{ ok: boolean; scanned?: number; refreshed?: number; skipped?: number | string; errors?: number; error?: string }> {
  const { data, error } = await supabase
    .from("platform_connections")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("platform", "tiktok")
    .limit(200)
  if (error) {
    if (/refresh_token|token_expires_at|platform_connections/i.test(error.message || "")) {
      return { ok: true, skipped: "migration" }
    }
    console.error("[cron/refresh-tiktok-tokens]", error.message)
    return { ok: false, error: "Failed to load TikTok connections" }
  }

  const summary = { scanned: (data || []).length, refreshed: 0, skipped: 0, errors: 0 }
  for (const row of data || []) {
    if (!row.refresh_token || !tiktokTokenNeedsRefresh(row.token_expires_at)) {
      summary.skipped++
      continue
    }
    let refresh = ""
    try {
      refresh = openAccessToken(row.refresh_token) || ""
    } catch {
      summary.errors++
      continue
    }
    if (!refresh) {
      summary.skipped++
      continue
    }
    const renewed = await refreshTikTokToken(refresh, fetchImpl)
    if (!renewed.ok) {
      summary.errors++
      continue
    }
    const { error: updateError } = await supabase
      .from("platform_connections")
      .update({
        access_token: sealAccessToken(renewed.token.accessToken),
        refresh_token: renewed.token.refreshToken ? sealAccessToken(renewed.token.refreshToken) : row.refresh_token,
        token_expires_at: tiktokTokenExpiry(renewed.token.expiresIn),
      })
      .eq("id", row.id)
    if (updateError) summary.errors++
    else summary.refreshed++
  }
  return { ok: true, ...summary }
}
