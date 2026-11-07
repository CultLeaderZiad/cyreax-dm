// Support tickets. Customers: list / open their own. Admins: list all (?all=1).
export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { takeRateSlots } from "@/lib/rate-limit"
import { TICKETS_PER_HOUR, TICKET_STATUSES, validateNewTicket } from "@/lib/support"
import { notifyAdmins } from "@/lib/billing/payment-notify"

export async function GET(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const supabase = await getSupabaseBypassClient()
  const isAdmin = session.user.role === "admin"
  const wantAll = isAdmin && request.nextUrl.searchParams.get("all") === "1"
  let query = supabase
    .from("support_tickets")
    .select("id, account_id, subject, category, status, payment_reference, created_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(100)
  if (!wantAll) query = query.eq("account_id", session.user.id)
  const status = request.nextUrl.searchParams.get("status")
  if (status && (TICKET_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status)
  const { data, error } = await query
  if (error) return NextResponse.json({ tickets: [], migration_required: true })
  let tickets = data || []
  if (wantAll && tickets.length) {
    const ids = [...new Set(tickets.map((t: any) => t.account_id))]
    const { data: accounts } = await supabase.from("accounts").select("id, email").in("id", ids)
    const email = new Map((accounts || []).map((a: any) => [a.id, a.email]))
    tickets = tickets.map((t: any) => ({ ...t, email: email.get(t.account_id) || null }))
  }
  return NextResponse.json({ tickets })
}

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const parsed = validateNewTicket(await request.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const supabase = await getSupabaseBypassClient()
  const allowed = await takeRateSlots(supabase, [
    { key: `abuse:support-ticket:account:${session.user.id}`, limit: TICKETS_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!allowed) return NextResponse.json({ error: "You've opened several tickets recently. Reply on an existing one or try again later." }, { status: 429 })

  const v = parsed.value
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      account_id: session.user.id,
      workspace_id: session.workspace?.id || null,
      subject: v.subject,
      category: v.category,
      payment_reference: v.paymentReference,
    })
    .select("id")
    .single()
  if (error || !ticket) {
    return NextResponse.json({ error: "Support isn't available yet. Please email us instead." }, { status: 503 })
  }
  await supabase.from("support_messages").insert({ ticket_id: ticket.id, author_account_id: session.user.id, author_role: "customer", body: v.body })
  await notifyAdmins(supabase, {
    title: "New support ticket",
    body: `${v.category}: ${v.subject}${v.paymentReference ? ` (${v.paymentReference})` : ""}`,
    link: `/dashboard/admin/support?ticket=${ticket.id}`,
  })
  return NextResponse.json({ id: ticket.id }, { status: 201 })
}
