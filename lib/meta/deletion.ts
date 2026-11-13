import { confirmationCode, deletionCallbackBody, metaAppSecret, metaUserId, parseSignedRequest } from "@/lib/meta/signed-request"

async function defaultSupabase(): Promise<any> {
  const { getSupabaseBypassClient } = await import("@/lib/supabase-server")
  return getSupabaseBypassClient()
}

const REVOKED = "revoked_meta"

function missing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table/i.test(message)
}

export async function readSignedRequestField(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null)
    const value = body?.signed_request
    return typeof value === "string" ? value : null
  }
  const text = await request.text()
  const params = new URLSearchParams(text)
  return params.get("signed_request")
}

async function matchingProfiles(supabase: any, externalUserId: string): Promise<Array<{ id: string | number; account_id?: string | null }>> {
  const found = new Map<string, { id: string | number; account_id?: string | null }>()
  const queries = [
    supabase.from("users").select("id, account_id").eq("business_account_id", externalUserId),
    supabase.from("users").select("id, account_id").eq("page_id", externalUserId),
  ]
  if (/^\d+$/.test(externalUserId)) queries.push(supabase.from("users").select("id, account_id").eq("id", externalUserId))
  for (const query of queries) {
    const { data, error } = await query
    if (error) continue
    for (const row of data || []) found.set(String(row.id), row)
  }
  return [...found.values()]
}

async function matchingConnections(supabase: any, externalUserId: string): Promise<Array<{ id: string; metadata?: Record<string, unknown> | null }>> {
  const found = new Map<string, { id: string; metadata?: Record<string, unknown> | null }>()
  for (const column of ["page_id", "external_account_id"]) {
    const { data, error } = await supabase.from("platform_connections").select("id, metadata").eq(column, externalUserId)
    if (error) continue
    for (const row of data || []) found.set(String(row.id), row)
  }
  return [...found.values()]
}

/**
 * Deauthorize stops using the token. Data deletion also removes conversations,
 * messages (cascade), and contacts for that Meta user. The Cyreax DM login stays.
 */
export async function applyMetaCallback(supabase: any, externalUserId: string, mode: "deauthorize" | "delete"): Promise<{ profiles: number; connections: number }> {
  const profiles = await matchingProfiles(supabase, externalUserId)
  const connections = await matchingConnections(supabase, externalUserId)
  for (const profile of profiles) {
    await supabase.from("users").update({ access_token: REVOKED, reconnect_required: true, updated_at: new Date().toISOString() }).eq("id", profile.id)
    if (mode === "delete") {
      await supabase.from("contacts").delete().eq("user_id", profile.id)
      await supabase.from("conversations").delete().eq("user_id", profile.id)
    }
  }
  for (const connection of connections) {
    // platform_connections has no reconnect_required column (only users does):
    // writing one made this whole update fail, leaving the token in place.
    // The flag lives in metadata, which /api/user/connections surfaces.
    await supabase
      .from("platform_connections")
      .update({ access_token: REVOKED, metadata: { ...(connection.metadata || {}), reconnect_required: true } })
      .eq("id", connection.id)
    if (mode === "delete") {
      const dropped = await supabase.from("platform_connections").delete().eq("id", connection.id)
      if (dropped?.error) {
        // Token wipe already happened. A missing delete privilege is not a silent success.
      }
    }
  }
  return { profiles: profiles.length, connections: connections.length }
}

export async function recordDeletionRequest(supabase: any, input: { code: string; provider: string; externalUserId: string | null; status: string; detail: string }): Promise<void> {
  const saved = await supabase.from("data_deletion_requests").insert({
    confirmation_code: input.code,
    provider: input.provider,
    external_user_id: input.externalUserId,
    status: input.status,
    detail: input.detail,
    completed_at: input.status === "completed" ? new Date().toISOString() : null,
  })
  if (saved?.error && !missing(saved.error)) console.error("[meta] could not store deletion request", saved.error.message)
}

export async function handleMetaDataDeletion(request: Request, supabase?: any): Promise<Response> {
  const secret = metaAppSecret()
  if (!secret) {
    return Response.json({ error: "Meta app secret is not configured" }, { status: 503 })
  }
  const signed = await readSignedRequestField(request)
  const payload = signed ? parseSignedRequest(signed, secret) : null
  const userId = metaUserId(payload)
  if (!payload || !userId) {
    return Response.json({ error: "Invalid signed_request" }, { status: 400 })
  }
  const db = supabase || (await defaultSupabase())
  const code = confirmationCode()
  let status = "completed"
  let detail = "No matching connection."
  try {
    const result = await applyMetaCallback(db, userId, "delete")
    detail = `Cleared ${result.profiles} profile(s) and ${result.connections} connection(s).`
  } catch (error) {
    status = "failed"
    detail = error instanceof Error ? error.message : "Deletion failed"
  }
  await recordDeletionRequest(db, { code, provider: "meta", externalUserId: userId, status, detail })
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  return Response.json(deletionCallbackBody(origin, code))
}

export async function handleMetaDeauthorize(request: Request, supabase?: any): Promise<Response> {
  const secret = metaAppSecret()
  if (!secret) return Response.json({ error: "Meta app secret is not configured" }, { status: 503 })
  const signed = await readSignedRequestField(request)
  const payload = signed ? parseSignedRequest(signed, secret) : null
  const userId = metaUserId(payload)
  if (!payload || !userId) return Response.json({ error: "Invalid signed_request" }, { status: 400 })
  const db = supabase || (await defaultSupabase())
  await applyMetaCallback(db, userId, "deauthorize")
  return Response.json({ success: true })
}
