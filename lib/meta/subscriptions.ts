import { FACEBOOK_GRAPH_BASE, INSTAGRAM_GRAPH_BASE } from "@/lib/graph"

/**
 * Webhook fields each Meta product must be subscribed to so inbound events
 * reach /api/{instagram,facebook}/webhook for real (non-tester) accounts.
 * Keep in sync with what lib/channels/normalize.ts handles.
 */
export const IG_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_reactions",
  "messaging_seen",
  "messaging_referral",
  "comments",
].join(",")

export const FB_PAGE_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_reactions",
  "message_echoes",
  "messaging_referrals",
  "feed",
].join(",")

type FetchLike = typeof fetch

/** Subscribes an Instagram professional account (Instagram Login token) to app webhooks. */
export async function subscribeInstagramAccount(accessToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const url = new URL(`${INSTAGRAM_GRAPH_BASE}/me/subscribed_apps`)
    url.searchParams.set("subscribed_fields", IG_SUBSCRIBED_FIELDS)
    url.searchParams.set("access_token", accessToken)
    const res = await fetchImpl(url.toString(), { method: "POST" })
    const json = await res.json().catch(() => null)
    return Boolean(res.ok && json?.success)
  } catch {
    return false
  }
}

/** Subscribes a Facebook Page (page access token) to app webhooks. */
export async function subscribeFacebookPage(pageId: string, pageAccessToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const url = new URL(`${FACEBOOK_GRAPH_BASE}/${pageId}/subscribed_apps`)
    url.searchParams.set("subscribed_fields", FB_PAGE_SUBSCRIBED_FIELDS)
    url.searchParams.set("access_token", pageAccessToken)
    const res = await fetchImpl(url.toString(), { method: "POST" })
    const json = await res.json().catch(() => null)
    return Boolean(res.ok && json?.success)
  } catch {
    return false
  }
}

/** Removes the app's webhook subscription from an Instagram account (on disconnect). */
export async function unsubscribeInstagramAccount(accessToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const url = new URL(`${INSTAGRAM_GRAPH_BASE}/me/subscribed_apps`)
    url.searchParams.set("access_token", accessToken)
    const res = await fetchImpl(url.toString(), { method: "DELETE" })
    const json = await res.json().catch(() => null)
    return Boolean(res.ok && json?.success)
  } catch {
    return false
  }
}
