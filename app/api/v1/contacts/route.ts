export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { workspaceFromApiKey } from "@/lib/integrations/api-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { emitIntegrationEvent } from "@/lib/integrations/dispatch"
import { takeRateSlots } from "@/lib/rate-limit"

/** 120 requests per minute per API key's workspace. Fails closed on DB errors. */
async function limited(supabase: Awaited<ReturnType<typeof getSupabaseBypassClient>>, userId: string | number) {
  const ok = await takeRateSlots(supabase as any, [{ key: `abuse:api-v1:user:${userId}`, limit: 120, windowSeconds: 60 }])
  return ok ? null : NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": "60" } })
}

export async function GET(request: NextRequest) {
  const auth = await workspaceFromApiKey(request)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = await getSupabaseBypassClient()
  const tooMany = await limited(supabase, auth.userId)
  if (tooMany) return tooMany
  const { data, error } = await supabase.from("contacts").select("id, channel, external_id, display_name, email, phone, tags, custom_fields, first_seen_at").eq("user_id", auth.userId).order("last_seen_at", { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ contacts: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await workspaceFromApiKey(request)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const externalId = String(body.externalId || body.external_id || "").trim()
  const channel = String(body.channel || "api").slice(0, 40)
  if (!externalId) return NextResponse.json({ error: "externalId is required" }, { status: 400 })
  const supabase = await getSupabaseBypassClient()
  const tooMany = await limited(supabase, auth.userId)
  if (tooMany) return tooMany
  // New contacts count against the plan's contact limit (inbound channels
  // already enforce this in lib/channels/store.ts; the API must too).
  const known = await supabase.from("contacts").select("id").eq("user_id", auth.userId).eq("channel", channel).eq("external_id", externalId).maybeSingle()
  if (!known.data) {
    const { accountIdForProfile, assertWithinLimit, limitPayload, loadAccount, PlanLimitError } = await import("@/lib/billing/enforce")
    const accountId = await accountIdForProfile(supabase, auth.userId)
    const account = accountId ? await loadAccount(supabase, accountId) : null
    if (account) {
      try {
        await assertWithinLimit(supabase, account, "contacts", 1)
      } catch (error) {
        if (error instanceof PlanLimitError) return NextResponse.json(limitPayload(error), { status: 402 })
        throw error
      }
    }
  }
  const now = new Date().toISOString()
  const row = {
    workspace_id: auth.workspaceId,
    user_id: auth.userId,
    channel,
    external_id: externalId,
    display_name: body.name || null,
    email: body.email || null,
    phone: body.phone || null,
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
    custom_fields: body.fields && typeof body.fields === "object" ? body.fields : {},
    source: "api",
    first_seen_at: now,
    last_seen_at: now,
  }
  const saved = await supabase.from("contacts").upsert(row, { onConflict: "user_id,channel,external_id" }).select("id").maybeSingle()
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 400 })
  await emitIntegrationEvent(supabase, {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    type: body.lead ? "lead.qualified" : "contact.created",
    data: { contactId: saved.data?.id, externalId, channel, email: body.email || null },
  })
  return NextResponse.json({ id: saved.data?.id })
}
