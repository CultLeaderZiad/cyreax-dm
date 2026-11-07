import { webhookHeaders, type WebhookEvent } from "@/lib/integrations/webhooks"
import { nextWebhookAttempt } from "@/lib/integrations/webhooks"
import type { Db } from "@/lib/channels/types"

export interface IntegrationEvent {
  workspaceId?: string | null
  userId: string | number
  type: WebhookEvent
  data: Record<string, unknown>
}

function missing(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message || ""
  return error?.code === "42P01" || error?.code === "PGRST205" || /schema cache|does not exist|Could not find the table/i.test(message)
}

export async function emitIntegrationEvent(supabase: Db, event: IntegrationEvent): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("outgoing_webhook_endpoints")
      .select("id, secret_ciphertext, url, events, enabled")
      .eq("user_id", event.userId)
      .eq("enabled", true)
    if (error) {
      if (missing(error)) return 0
      console.warn("[webhooks] list failed:", error.message)
      return 0
    }
    let queued = 0
    for (const endpoint of data || []) {
      const events: string[] = Array.isArray(endpoint.events) ? endpoint.events : []
      if (!events.includes(event.type)) continue
      const inserted = await supabase.from("outgoing_webhook_deliveries").insert({
        endpoint_id: endpoint.id,
        workspace_id: event.workspaceId || null,
        user_id: event.userId,
        event: event.type,
        payload: { type: event.type, data: event.data, sent_at: new Date().toISOString() },
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      })
      if (!inserted.error) queued += 1
    }
    return queued
  } catch (error) {
    console.warn("[webhooks] emit failed:", error)
    return 0
  }
}

export async function deliverWebhook(input: {
  url: string
  secret: string
  body: string
  nowMs: number
  fetchImpl?: typeof fetch
  checkHost?: (url: string) => Promise<boolean>
}): Promise<{ ok: boolean; status: number }> {
  const fetchImpl = input.fetchImpl || fetch
  const checkHost = input.checkHost || (await import("@/lib/net/public-host")).resolvesToPublicHost
  // Endpoints are re-checked at send time: DNS can change after the URL was saved.
  if (!(await checkHost(input.url))) return { ok: false, status: 0 }
  const response = await fetchImpl(input.url, {
    method: "POST",
    headers: webhookHeaders(input.secret, input.body, input.nowMs),
    body: input.body,
    redirect: "manual",
  })
  return { ok: response.ok, status: response.status }
}

export function deliveryAfterFailure(attemptsAfter: number, nowMs: number) {
  const plan = nextWebhookAttempt(attemptsAfter, nowMs, 5)
  return {
    status: plan.status === "dead" ? "dead" : "pending",
    attempts: attemptsAfter,
    nextAttemptAt: new Date(plan.nextAttemptAt).toISOString(),
  }
}
