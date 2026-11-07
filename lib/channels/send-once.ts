import type { Db, NormalizedInbound } from "@/lib/channels/types"

/**
 * At-most-once outbound sends.
 *
 * inbound_events dedupes deliveries, but a worker that sends a reply and then
 * throws later in the same event retries the whole event, which sent the
 * reply again. Each send now claims a key derived from the inbound message or
 * comment id plus what is being sent. A second attempt finds the claim and
 * skips. A send that fails releases its claim so a retry can try again.
 *
 * Trade-off: if the process dies between claiming and the provider call, that
 * one reply is not retried. For auto-replies a missing reply is better than a
 * duplicate one.
 */
export function sendKey(event: Pick<NormalizedInbound, "channel" | "messageId" | "commentId" | "groupId" | "contactExternalId">, purpose: string): string | null {
  const id = event.commentId || event.messageId || event.groupId
  if (!id) return null
  return `${event.channel}:${id}:${event.contactExternalId}:${purpose}`.slice(0, 300)
}

function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || /outbound_sends|schema cache|does not exist/i.test(error?.message || "")
}

export type ClaimResult = "claimed" | "duplicate" | "untracked"

export async function claimSend(supabase: Db, key: string | null): Promise<ClaimResult> {
  if (!key) return "untracked"
  const { error } = await (supabase as any).from("outbound_sends").insert({ send_key: key })
  if (!error) return "claimed"
  if (error.code === "23505") return "duplicate"
  // Table not migrated yet, or a transient error: keep the previous behaviour
  // (send) rather than drop a customer's reply.
  if (!missingTable(error)) console.warn("[send-once] claim failed, sending untracked:", error.message)
  return "untracked"
}

export async function releaseSend(supabase: Db, key: string | null): Promise<void> {
  if (!key) return
  await (supabase as any).from("outbound_sends").delete().eq("send_key", key)
}
