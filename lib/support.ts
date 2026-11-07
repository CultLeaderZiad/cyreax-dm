export const TICKET_CATEGORIES = ["payment", "bug", "account", "other"] as const
export const TICKET_STATUSES = ["open", "waiting_customer", "resolved", "closed"] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKETS_PER_HOUR = 5
export const MESSAGES_PER_HOUR = 30

export function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max)
}

export function validateNewTicket(raw: Record<string, unknown>):
  | { ok: true; value: { subject: string; category: TicketCategory; body: string; paymentReference: string | null } }
  | { ok: false; error: string } {
  const subject = cleanText(raw.subject, 160)
  const body = cleanText(raw.body, 5000)
  const category = (TICKET_CATEGORIES as readonly string[]).includes(String(raw.category)) ? (raw.category as TicketCategory) : "other"
  const ref = cleanText(raw.paymentReference, 32).toUpperCase()
  if (subject.length < 3) return { ok: false, error: "Add a short subject." }
  if (body.length < 1) return { ok: false, error: "Describe the problem." }
  return { ok: true, value: { subject, category, body, paymentReference: /^CX-[A-Z2-9]{6}$/.test(ref) ? ref : null } }
}
