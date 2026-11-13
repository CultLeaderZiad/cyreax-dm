import { FACEBOOK_GRAPH_BASE, INSTAGRAM_GRAPH_BASE } from "@/lib/graph"

type FetchLike = typeof fetch

/** Graph error codes that mean "this token will never work again; reconnect". */
const DEAD_TOKEN_CODES = new Set([190, 102, 463, 467, 10])

export type TokenVerdict = "ok" | "dead" | "unknown"

export function classifyGraphResponse(status: number, json: any): TokenVerdict {
  if (status >= 200 && status < 300 && json && !json.error) return "ok"
  const code = Number(json?.error?.code)
  if (DEAD_TOKEN_CODES.has(code)) return "dead"
  // Rate limits, outages, permission changes: don't flip the user's UI on a guess.
  return "unknown"
}

/** Cheapest call that proves the token still works for this connection. */
export function probeUrl(platform: string, pageId: string | null | undefined): string | null {
  if (platform === "facebook" || platform === "messenger") return `${FACEBOOK_GRAPH_BASE}/me?fields=id`
  if (platform === "instagram") return `${INSTAGRAM_GRAPH_BASE}/me?fields=user_id`
  if (platform === "whatsapp" && pageId) return `${FACEBOOK_GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id`
  return null
}

export async function probeToken(platform: string, pageId: string | null | undefined, token: string, fetchImpl: FetchLike = fetch): Promise<TokenVerdict> {
  const url = probeUrl(platform, pageId)
  if (!url) return "unknown"
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) })
    const json = await res.json().catch(() => null)
    return classifyGraphResponse(res.status, json)
  } catch {
    return "unknown"
  }
}
