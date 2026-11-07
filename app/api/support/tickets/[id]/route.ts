// One ticket: GET thread, POST reply, PATCH status. Owner or admin only.
export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { takeRateSlots } from "@/lib/rate-limit"
import { MESSAGES_PER_HOUR, TICKET_STATUSES, cleanText } from "@/lib/support"
import { notifyAccount, notifyAdmins } from "@/lib/billing/payment-notify"

type Ctx = { params: Promise<{ id: string }> }

async function load(request: NextRequest, ctx: Ctx) {
  const session = await requireSessionUser(request)
  if (session.response) return { response: session.response }
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { response: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) }
  const supabase = await getSupabaseBypassClient()
  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", id).maybeSingle()
  const isAdmin = session.user.role === "admin"
  // Someone else's ticket looks exactly like a missing one.
  if (!ticket || (!isAdmin && ticket.account_id !== session.user.id)) {
    return { response: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) }
  }
  return { session, supabase, ticket, isAdmin }
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const loaded = await load(request, ctx)
  if (loaded.response) return loaded.response
  const { supabase, ticket } = loaded
  const { data: messages } = await supabase
    .from("support_messages")
    .select("id, author_role, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true })
  let email: string | null = null
  if (loaded.isAdmin) {
    const { data: acct } = await supabase.from("accounts").select("email").eq("id", ticket.account_id).maybeSingle()
    email = acct?.email || null
  }
  return NextResponse.json({ ticket: { ...ticket, email }, messages: messages || [] })
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const loaded = await load(request, ctx)
  if (loaded.response) return loaded.response
  const { supabase, ticket, isAdmin, session } = loaded
  const body = cleanText((await request.json().catch(() => ({}))).body, 5000)
  if (!body) return NextResponse.json({ error: "Write a message first." }, { status: 400 })
  if (ticket.status === "closed" && !isAdmin) return NextResponse.json({ error: "This ticket is closed. Open a new one." }, { status: 409 })
  const allowed = await takeRateSlots(supabase, [
    { key: `abuse:support-msg:account:${session.user.id}`, limit: MESSAGES_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!allowed) return NextResponse.json({ error: "Too many messages. Please wait a little." }, { status: 429 })

  const now = new Date().toISOString()
  const role = isAdmin && ticket.account_id !== session.user.id ? "admin" : "customer"
  await supabase.from("support_messages").insert({ ticket_id: ticket.id, author_account_id: session.user.id, author_role: role, body })
  await supabase
    .from("support_tickets")
    .update({ status: role === "admin" ? "waiting_customer" : "open", last_message_at: now, updated_at: now })
    .eq("id", ticket.id)
  if (role === "admin") {
    await notifyAccount(supabase, ticket.account_id, ticket.workspace_id, {
      title: "Support replied",
      body: ticket.subject,
      link: `/dashboard/support?ticket=${ticket.id}`,
    })
  } else {
    await notifyAdmins(supabase, { title: "Customer replied", body: ticket.subject, link: `/dashboard/admin/support?ticket=${ticket.id}` })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const loaded = await load(request, ctx)
  if (loaded.response) return loaded.response
  const { supabase, ticket, isAdmin } = loaded
  const status = String((await request.json().catch(() => ({}))).status || "")
  if (!(TICKET_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  // Customers may only close their own ticket; admins set any status.
  if (!isAdmin && status !== "closed") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticket.id)
  if (isAdmin && ticket.account_id !== loaded.session.user.id && (status === "resolved" || status === "closed")) {
    await notifyAccount(supabase, ticket.account_id, ticket.workspace_id, {
      title: status === "resolved" ? "Ticket resolved" : "Ticket closed",
      body: ticket.subject,
      link: `/dashboard/support?ticket=${ticket.id}`,
    })
  }
  return NextResponse.json({ ok: true, status })
}
