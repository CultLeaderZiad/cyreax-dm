/**
 * Every status column in Cyreax DM, as an explicit state machine.
 *
 * This is the single place to answer "what states can X be in, and how does
 * it move?" for people, code and coding agents. docs/STATE_MACHINES.md is
 * generated from it (`pnpm state:docs`), and tests/state-machines.test.mts
 * fails when this file drifts from the SQL CHECK constraints or the doc.
 *
 * Writers that guard with `transition()` today: orders, support tickets.
 * Other writers keep their existing compare-and-set / SQL rules; the table
 * here documents them and must stay true to them.
 */

export type Lang = "en" | "ar"

export interface MachineDef<S extends string = string> {
  /** Table and column the state lives in. */
  table: string
  column: string
  initial: S
  /** Allowed next states. A state with [] is terminal. */
  transitions: Record<S, readonly S[]>
  /** Labels for anything shown to customers or admins. */
  labels?: Partial<Record<S, Record<Lang, string>>>
  /** Who/what moves it, for humans and agents reading this file. */
  writers: string[]
}

const L = (en: string, ar: string): Record<Lang, string> => ({ en, ar })

function machine<const T extends Record<string, readonly string[]>>(def: {
  table: string
  column: string
  initial: NoInfer<Extract<keyof T, string>>
  transitions: T & Record<string, readonly NoInfer<Extract<keyof T, string>>[]>
  labels?: Partial<Record<Extract<keyof T, string>, Record<Lang, string>>>
  writers: string[]
}) {
  return def
}

export const MACHINES = {
  billingAccount: machine({
    table: "billing_accounts",
    column: "status",
    initial: "trialing",
    transitions: {
      trialing: ["active", "canceled", "expired"],
      active: ["past_due", "canceled", "expired"],
      past_due: ["active", "expired", "canceled"],
      canceled: ["active", "trialing"],
      expired: ["active", "trialing"],
    },
    labels: {
      trialing: L("Trial", "تجربة"),
      active: L("Active", "نشط"),
      past_due: L("Payment due", "الدفع مستحق"),
      canceled: L("Canceled", "ملغي"),
      expired: L("Expired", "منتهي"),
    },
    writers: ["lib/billing/activation.ts", "app/api/cron/dunning/route.ts", "cyreax_review_payment() SQL"],
  }),

  paymentSubmission: machine({
    table: "payment_submissions",
    column: "status",
    initial: "pending",
    transitions: { pending: ["approved", "rejected"], approved: [], rejected: [] },
    labels: {
      pending: L("Under review", "قيد المراجعة"),
      approved: L("Approved", "تمت الموافقة"),
      rejected: L("Rejected", "مرفوض"),
    },
    writers: ["app/api/payments/manual/route.ts (insert pending)", "cyreax_review_payment() SQL (locks row, pending only)"],
  }),

  paymentIntent: machine({
    table: "payment_intents",
    column: "status",
    initial: "pending",
    transitions: { pending: ["paid", "cancelled", "failed"], paid: [], cancelled: [], failed: [] },
    writers: ["lib/commerce/intents.ts (compare-and-set on pending)"],
  }),

  order: machine({
    table: "orders",
    column: "status",
    initial: "pending_payment",
    transitions: {
      draft: ["pending_payment", "cancelled"],
      pending_payment: ["paid", "cancelled"],
      paid: ["fulfilled", "refunded", "cancelled"],
      fulfilled: ["refunded"],
      cancelled: [],
      refunded: [],
    },
    labels: {
      draft: L("Draft", "مسودة"),
      pending_payment: L("Awaiting payment", "بانتظار الدفع"),
      paid: L("Paid", "مدفوع"),
      fulfilled: L("Fulfilled", "تم التسليم"),
      cancelled: L("Cancelled", "ملغي"),
      refunded: L("Refunded", "مسترد"),
    },
    writers: ["lib/commerce/checkout.ts markOrderFromProvider (guarded)"],
  }),

  clientInvoice: machine({
    table: "client_invoices",
    column: "status",
    initial: "open",
    transitions: { open: ["paid", "past_due", "void"], past_due: ["paid", "void"], paid: [], void: [] },
    writers: ["app/api/agency/invoices/route.ts", "app/api/payments/{paymob,tap}", "app/api/cron/dunning/route.ts"],
  }),

  supportTicket: machine({
    table: "support_tickets",
    column: "status",
    initial: "open",
    transitions: {
      open: ["waiting_customer", "resolved", "closed"],
      waiting_customer: ["open", "resolved", "closed"],
      resolved: ["open", "closed"],
      closed: ["open"],
    },
    labels: {
      open: L("Open", "مفتوحة"),
      waiting_customer: L("Awaiting your reply", "بانتظار ردك"),
      resolved: L("Resolved", "تم الحل"),
      closed: L("Closed", "مغلقة"),
    },
    writers: ["app/api/support/tickets/[id]/route.ts (guarded)"],
  }),

  inboundEvent: machine({
    table: "inbound_events",
    column: "status",
    initial: "pending",
    transitions: { pending: ["processing"], processing: ["done", "pending", "dead"], done: [], dead: [] },
    writers: ["lib/inbound-queue.ts (insert)", "claim_inbound_events() SQL", "lib/inbound-worker.ts (backoff, dead after 5)"],
  }),

  flowJob: machine({
    table: "flow_jobs",
    column: "status",
    initial: "pending",
    transitions: { pending: ["processing", "cancelled"], processing: ["done", "pending", "dead"], done: [], dead: [], cancelled: [] },
    writers: ["lib/flows/runtime.ts"],
  }),

  outgoingWebhookDelivery: machine({
    table: "outgoing_webhook_deliveries",
    column: "status",
    initial: "pending",
    transitions: { pending: ["pending", "done", "dead"], done: [], dead: [] },
    writers: ["lib/integrations/drain.ts"],
  }),

  flow: machine({
    table: "flows",
    column: "status",
    initial: "draft",
    transitions: { draft: ["live", "paused"], live: ["paused", "draft"], paused: ["live", "draft"] },
    labels: { draft: L("Draft", "مسودة"), live: L("Live", "مفعّل"), paused: L("Paused", "متوقف") },
    writers: ["app/api/flows/[id]/route.ts", "app/api/flows/[id]/publish/route.ts"],
  }),

  sequence: machine({
    table: "sequences",
    column: "status",
    initial: "draft",
    transitions: { draft: ["live", "paused"], live: ["paused", "draft"], paused: ["live", "draft"] },
    writers: ["app/api/sequences/route.ts"],
  }),

  flowRun: machine({
    table: "flow_runs",
    column: "status",
    initial: "active",
    transitions: {
      active: ["waiting", "completed", "failed", "paused", "opted_out"],
      waiting: ["active", "completed", "failed", "paused", "opted_out"],
      paused: ["active", "waiting", "completed", "opted_out"],
      completed: [],
      failed: [],
      opted_out: [],
    },
    writers: ["lib/flows/engine.ts", "lib/flows/runtime.ts"],
  }),

  broadcast: machine({
    table: "broadcasts",
    column: "status",
    initial: "draft",
    transitions: {
      draft: ["scheduled", "sending", "cancelled"],
      scheduled: ["sending", "draft", "cancelled"],
      sending: ["sent", "cancelled"],
      sent: [],
      cancelled: [],
    },
    writers: ["app/api/broadcasts/route.ts", "lib/flows/runtime.ts"],
  }),

  emailCampaign: machine({
    table: "email_campaigns",
    column: "status",
    initial: "draft",
    transitions: {
      draft: ["scheduled", "sending"],
      scheduled: ["sending", "draft"],
      sending: ["completed", "failed"],
      completed: [],
      failed: ["draft", "sending"],
    },
    writers: ["app/api/admin/campaigns/**", "lib/campaign-sender.ts", "app/api/cron/send-scheduled-campaigns/route.ts"],
  }),

  giveaway: machine({
    table: "giveaways",
    column: "status",
    initial: "open",
    transitions: { open: ["drawn", "closed"], drawn: ["closed"], closed: [] },
    writers: ["app/api/growth/route.ts"],
  }),

  teamInvite: machine({
    table: "agency_team_members",
    column: "status",
    initial: "invited",
    transitions: { invited: ["active"], active: [] },
    writers: ["app/api/team/route.ts", "app/api/team/accept/route.ts"],
  }),
} as const

export type MachineName = keyof typeof MACHINES
export type StateOf<M extends MachineName> = Extract<keyof (typeof MACHINES)[M]["transitions"], string>

export function isState<M extends MachineName>(name: M, value: unknown): value is StateOf<M> {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MACHINES[name].transitions, value)
}

export function canTransition<M extends MachineName>(name: M, from: string, to: string): boolean {
  if (!isState(name, from) || !isState(name, to)) return false
  const next = (MACHINES[name].transitions as Record<string, readonly string[]>)[from]
  return next.includes(to)
}

/** Same shape as the original applyOrderStatus: never throws, reports whether it moved. */
export function transition<M extends MachineName>(name: M, from: string, to: string): { status: string; changed: boolean } {
  if (from === to || !canTransition(name, from, to)) return { status: from, changed: false }
  return { status: to, changed: true }
}

export function isTerminal<M extends MachineName>(name: M, state: string): boolean {
  return isState(name, state) && (MACHINES[name].transitions as Record<string, readonly string[]>)[state].length === 0
}

export function stateLabel<M extends MachineName>(name: M, state: string, lang: Lang = "en"): string {
  const labels = MACHINES[name].labels as Partial<Record<string, Record<Lang, string>>> | undefined
  return labels?.[state]?.[lang] ?? state.replace(/_/g, " ")
}
