export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { normalizeLead } from "@/lib/growth/tools"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { clientIpFromHeaders, takeRateSlots } from "@/lib/rate-limit"
import { startIdempotencyKey } from "@/lib/flows/engine"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await getSupabaseBypassClient()
  const { data } = await supabase.from("bio_pages").select("slug, title, subtitle, collect_email, collect_phone, locale").eq("slug", slug).maybeSingle()
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ page: data })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const body = await request.json()
    const lead = normalizeLead({ email: body.email, phone: body.phone, name: body.name })
    if (!lead.ok) return NextResponse.json({ error: lead.error }, { status: 400 })
    const supabase = await getSupabaseBypassClient()
    // Unauthenticated form that writes contacts into a tenant's CRM and can
    // start a flow: cap per IP and per page so it can't be used to flood them.
    const allowed = await takeRateSlots(supabase, [
      { key: `abuse:bio:ip:${clientIpFromHeaders(request.headers)}`, limit: 10, windowSeconds: 3600 },
      { key: `abuse:bio:page:${String(slug).slice(0, 80)}`, limit: 300, windowSeconds: 3600 },
    ])
    if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    const page = await supabase.from("bio_pages").select("*").eq("slug", slug).maybeSingle()
    if (!page.data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const externalId = (lead.email || lead.phone || "").toLowerCase()
    const now = new Date().toISOString()
    const existing = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", page.data.user_id)
      .eq("channel", "bio")
      .eq("external_id", externalId)
      .maybeSingle()
    if (existing.data?.id) {
      await supabase.from("contacts").update({
        display_name: lead.name,
        email: lead.email,
        phone: lead.phone,
        last_seen_at: now,
        updated_at: now,
      }).eq("id", existing.data.id)
    } else {
      await supabase.from("contacts").insert({
        workspace_id: page.data.workspace_id,
        user_id: page.data.user_id,
        channel: "bio",
        external_id: externalId,
        display_name: lead.name,
        email: lead.email,
        phone: lead.phone,
        tags: ["bio"],
        source: "bio",
        opted_in: body.optIn === true,
        first_seen_at: now,
        last_seen_at: now,
      })
    }
    if (page.data.flow_id) {
      const flow = await supabase.from("flows").select("id, published_version_id, status").eq("id", page.data.flow_id).eq("user_id", page.data.user_id).maybeSingle()
      if (flow.data?.status === "live") {
        await supabase.from("flow_jobs").insert({
          user_id: page.data.user_id,
          workspace_id: page.data.workspace_id,
          kind: "start",
          idempotency_key: startIdempotencyKey(flow.data.id, externalId, `bio:${slug}`),
          flow_id: flow.data.id,
          contact_external_id: externalId,
          channel: "bio",
          payload: { versionId: flow.data.published_version_id, eventId: `bio:${slug}`, text: lead.email || lead.phone },
          status: "pending",
          next_attempt_at: now,
        })
      }
    }
    return NextResponse.json({ ok: true, id: randomUUID() })
  } catch (error) {
    console.error("[bio] POST", error)
    return NextResponse.json({ error: "Could not save" }, { status: 500 })
  }
}
