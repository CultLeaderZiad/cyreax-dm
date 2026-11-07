import { FACEBOOK_GRAPH_BASE } from "@/lib/graph"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type VerifiedPage =
  | { ok: true; pageId: string; pageAccessToken: string; name: string | null; category: string | null }
  | { ok: false; error: string }

/**
 * Resolve a Page access token for `pageId` using the caller's own Facebook
 * user token. Graph only returns a Page token to someone with a task on that
 * Page, so getting one back is the proof of control we store against.
 *
 * Never falls back to the user token or to a placeholder: a page id the
 * caller cannot prove control of must not be written to platform_connections,
 * because webhooks for that page are routed by page_id.
 */
export async function resolveVerifiedPageToken(input: {
  pageId: string
  userAccessToken: string
  fetchImpl?: FetchLike
}): Promise<VerifiedPage> {
  const pageId = String(input.pageId || "").trim()
  if (!/^\d{1,32}$/.test(pageId)) return { ok: false, error: "Page id must be numeric" }
  if (!input.userAccessToken) return { ok: false, error: "no_user_token" }
  const fetchImpl = input.fetchImpl || (fetch as FetchLike)

  // Method A: the Pages this user manages.
  try {
    const url = new URL(`${FACEBOOK_GRAPH_BASE}/me/accounts`)
    url.searchParams.set("fields", "id,name,category,access_token")
    url.searchParams.set("limit", "100")
    url.searchParams.set("access_token", input.userAccessToken)
    const res = await fetchImpl(url.toString())
    const json: any = await res.json().catch(() => null)
    if (res.ok && Array.isArray(json?.data)) {
      const match = json.data.find((page: any) => String(page?.id) === pageId)
      if (match?.access_token) {
        return {
          ok: true,
          pageId,
          pageAccessToken: String(match.access_token),
          name: match.name ? String(match.name) : null,
          category: match.category ? String(match.category) : null,
        }
      }
    }
  } catch {
    // fall through to Method B
  }

  // Method B: direct lookup. Business Manager pages may not be listed above,
  // but Graph still only returns `access_token` to someone who manages the page.
  try {
    const url = new URL(`${FACEBOOK_GRAPH_BASE}/${pageId}`)
    url.searchParams.set("fields", "id,access_token,name,category")
    url.searchParams.set("access_token", input.userAccessToken)
    const res = await fetchImpl(url.toString())
    const json: any = await res.json().catch(() => null)
    if (res.ok && json?.access_token && String(json?.id || pageId) === pageId) {
      return {
        ok: true,
        pageId,
        pageAccessToken: String(json.access_token),
        name: json.name ? String(json.name) : null,
        category: json.category ? String(json.category) : null,
      }
    }
  } catch {
    // fall through
  }

  return { ok: false, error: "not_page_admin" }
}
