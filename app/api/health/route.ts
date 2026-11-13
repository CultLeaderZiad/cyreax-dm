export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { captureException } from "@/lib/monitoring"
import { BRAND } from "@/lib/brand"

export async function GET() {
  const time = new Date().toISOString()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      ok: true,
      service: BRAND.slug,
      status: "degraded",
      time,
      checks: { supabase: "unconfigured" },
    })
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: serviceKey },
      cache: "no-store",
    })
    const supabase = response.ok ? "ok" : "down"
    const extra = response.ok ? await backgroundChecks() : { queue: "unknown", email: "unknown" }
    // A stuck queue means customers are not getting replies: report 503 so an
    // uptime monitor pages someone. Missing email config is reported but not fatal.
    const healthy = response.ok && extra.queue !== "stuck"
    return NextResponse.json(
      { ok: healthy, service: BRAND.slug, status: healthy ? "ok" : "degraded", time, checks: { supabase, ...extra } },
      { status: healthy ? 200 : 503 },
    )
  } catch (error) {
    await captureException(error, { route: "health" })
    return NextResponse.json(
      { ok: false, service: BRAND.slug, status: "degraded", time, checks: { supabase: "down" } },
      { status: 503 },
    )
  }
}

/** Inbound messages due more than 10 minutes ago and still pending = the scheduler is not running. */
async function backgroundChecks(): Promise<{ queue: string; email: string }> {
  try {
    const { getSupabaseBypassClient } = await import("@/lib/supabase-server")
    const db = await getSupabaseBypassClient()
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString()
    const [stale, smtp] = await Promise.all([
      db.from("inbound_events").select("id", { count: "exact", head: true }).eq("status", "pending").lt("next_attempt_at", cutoff),
      db.from("app_settings").select("key").eq("key", "smtp_settings").maybeSingle(),
    ])
    const queue = stale.error ? "unknown" : (stale.count ?? 0) > 0 ? "stuck" : "ok"
    const email = smtp.error ? "unknown" : smtp.data ? "ok" : "unconfigured"
    return { queue, email }
  } catch {
    return { queue: "unknown", email: "unknown" }
  }
}
