export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { calculateRevenueFunnel, calculateDelta } from "@/lib/analytics/funnel"

const COMMENT_EVENT_TYPES = [
  "comment_dm",
  "comment_reply",
  "comment_trigger",
  "comment_cross_post",
  "comment",
] as const

const PAID_ORDER_STATUSES = ["paid", "fulfilled"] as const

interface OrderRow {
  id: string
  contact_id: string | null
  contact_external_id: string | null
  status: string
  currency: string | null
  total_cents: number | null
  channel: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSessionUser(request)
    if (authResult.response) return authResult.response

    const { user: account, igUser, workspace } = authResult
    const workspaceId = workspace?.id || account?.workspace_id || null

    const supabase = await getSupabaseBypassClient()

    let userId = igUser?.id
    if (!userId && account) {
      try {
        const profile = await ensureTenantProfile(
          supabase,
          account,
          "workspace_managed",
          workspaceId
        )
        userId = profile?.id
      } catch {
        userId = account.id
      }
    }

    const searchParams = request.nextUrl.searchParams
    const rawDays = Number.parseInt(searchParams.get("days") || "30", 10)
    const days: 7 | 30 | 90 = rawDays === 7 || rawDays === 90 ? rawDays : 30

    const now = new Date()
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000)

    const nowISO = now.toISOString()
    const currentStartISO = currentStart.toISOString()
    const previousStartISO = previousStart.toISOString()

    // Helper to scope queries by workspace_id or user_id with fallback
    async function runScopedQuery<T>(
      buildQuery: (sb: any) => any
    ): Promise<{ data: T | null; count: number }> {
      try {
        const applyScope = (query: any) => {
          if (workspaceId && userId) {
            return query.or(`workspace_id.eq.${workspaceId},user_id.eq.${userId}`)
          }
          if (workspaceId) {
            return query.eq("workspace_id", workspaceId)
          }
          if (userId) {
            return query.eq("user_id", userId)
          }
          return query
        }

        let res = await applyScope(buildQuery(supabase))

        if (res.error && workspaceId && /workspace_id/i.test(res.error.message || "")) {
          res = await buildQuery(supabase).eq("user_id", userId)
        }

        if (res.error) {
          return { data: null, count: 0 }
        }
        return { data: res.data, count: res.count || 0 }
      } catch {
        return { data: null, count: 0 }
      }
    }

    // 1. Comments handled (automation_events comment events)
    const [currentComments, prevComments] = await Promise.all([
      runScopedQuery((sb) =>
        sb
          .from("automation_events")
          .select("*", { count: "exact", head: true })
          .in("event_type", [...COMMENT_EVENT_TYPES])
          .gte("created_at", currentStartISO)
          .lte("created_at", nowISO)
      ),
      runScopedQuery((sb) =>
        sb
          .from("automation_events")
          .select("*", { count: "exact", head: true })
          .in("event_type", [...COMMENT_EVENT_TYPES])
          .gte("created_at", previousStartISO)
          .lt("created_at", currentStartISO)
      ),
    ])

    const commentsCount = currentComments.count
    const prevCommentsCount = prevComments.count

    // 2. DM conversations started (conversations)
    let [curConv, prevConv] = await Promise.all([
      runScopedQuery((sb) =>
        sb
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .gte("created_at", currentStartISO)
          .lte("created_at", nowISO)
      ),
      runScopedQuery((sb) =>
        sb
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .gte("created_at", previousStartISO)
          .lt("created_at", currentStartISO)
      ),
    ])

    let convCount = curConv.count
    let prevConvCount = prevConv.count

    // Fallback to last_message_at if created_at was missing or yielded 0
    if (convCount === 0 && prevConvCount === 0) {
      const [fallbackCur, fallbackPrev] = await Promise.all([
        runScopedQuery((sb) =>
          sb
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .gte("last_message_at", currentStartISO)
            .lte("last_message_at", nowISO)
        ),
        runScopedQuery((sb) =>
          sb
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .gte("last_message_at", previousStartISO)
            .lt("last_message_at", currentStartISO)
        ),
      ])
      if (fallbackCur.count > 0 || fallbackPrev.count > 0) {
        convCount = fallbackCur.count
        prevConvCount = fallbackPrev.count
      }
    }

    // 3. Orders queries for current and previous period
    const [currentOrdersRes, prevOrdersRes] = await Promise.all([
      runScopedQuery<OrderRow[]>((sb) =>
        sb
          .from("orders")
          .select("id, contact_id, contact_external_id, status, currency, total_cents, channel, created_at")
          .gte("created_at", currentStartISO)
          .lte("created_at", nowISO)
      ),
      runScopedQuery<OrderRow[]>((sb) =>
        sb
          .from("orders")
          .select("id, contact_id, contact_external_id, status, currency, total_cents, channel, created_at")
          .gte("created_at", previousStartISO)
          .lt("created_at", currentStartISO)
      ),
    ])

    const currentOrders: OrderRow[] = currentOrdersRes.data || []
    const prevOrders: OrderRow[] = prevOrdersRes.data || []

    const currentPaidOrders = currentOrders.filter((o) =>
      PAID_ORDER_STATUSES.includes(o.status as any)
    )
    const prevPaidOrders = prevOrders.filter((o) =>
      PAID_ORDER_STATUSES.includes(o.status as any)
    )

    // 4. Leads (contacts with email or phone, or with any order in the period)
    const [currentContactsRes, prevContactsRes] = await Promise.all([
      runScopedQuery<any[]>((sb) =>
        sb
          .from("contacts")
          .select("id, external_id, email, phone, created_at")
          .gte("created_at", currentStartISO)
          .lte("created_at", nowISO)
          .limit(2000)
      ),
      runScopedQuery<any[]>((sb) =>
        sb
          .from("contacts")
          .select("id, external_id, email, phone, created_at")
          .gte("created_at", previousStartISO)
          .lt("created_at", currentStartISO)
          .limit(2000)
      ),
    ])

    const currentOrderContactIds = new Set(
      currentOrders.map((o) => o.contact_id).filter(Boolean)
    )
    const currentOrderExternalIds = new Set(
      currentOrders.map((o) => o.contact_external_id).filter(Boolean)
    )

    const prevOrderContactIds = new Set(
      prevOrders.map((o) => o.contact_id).filter(Boolean)
    )
    const prevOrderExternalIds = new Set(
      prevOrders.map((o) => o.contact_external_id).filter(Boolean)
    )

    const isQualifiedContact = (
      c: { id: string; external_id?: string | null; email?: string | null; phone?: string | null },
      contactIds: Set<unknown>,
      externalIds: Set<unknown>
    ) => {
      const hasEmail = Boolean(c.email && c.email.trim().length > 0)
      const hasPhone = Boolean(c.phone && c.phone.trim().length > 0)
      const hasOrder =
        contactIds.has(c.id) || (c.external_id ? externalIds.has(c.external_id) : false)
      return hasEmail || hasPhone || hasOrder
    }

    const currentContacts = currentContactsRes.data || []
    const prevContacts = prevContactsRes.data || []

    const currentContactLeads = currentContacts.filter((c: any) =>
      isQualifiedContact(c, currentOrderContactIds, currentOrderExternalIds)
    )
    const prevContactLeads = prevContacts.filter((c: any) =>
      isQualifiedContact(c, prevOrderContactIds, prevOrderExternalIds)
    )

    // Count order leads that were not present in the contacts response
    const matchedContactIds = new Set(currentContactLeads.map((c: any) => c.id))
    const matchedExternalIds = new Set(
      currentContactLeads.map((c: any) => c.external_id).filter(Boolean)
    )
    const unattachedOrders = currentOrders.filter((o) => {
      if (o.contact_id && matchedContactIds.has(o.contact_id)) return false
      if (o.contact_external_id && matchedExternalIds.has(o.contact_external_id)) return false
      return true
    })

    const prevMatchedContactIds = new Set(prevContactLeads.map((c: any) => c.id))
    const prevMatchedExternalIds = new Set(
      prevContactLeads.map((c: any) => c.external_id).filter(Boolean)
    )
    const prevUnattachedOrders = prevOrders.filter((o) => {
      if (o.contact_id && prevMatchedContactIds.has(o.contact_id)) return false
      if (o.contact_external_id && prevMatchedExternalIds.has(o.contact_external_id)) return false
      return true
    })

    const currentLeadsCount = currentContactLeads.length + unattachedOrders.length
    const prevLeadsCount = prevContactLeads.length + prevUnattachedOrders.length

    // 5. Revenue calculation (sum of orders.total_cents grouped by currency)
    const revenueByCurrency: Record<string, { total_cents: number; count: number }> = {}
    let primaryTotalCents = 0
    let primaryCurrency = "EGP"

    for (const order of currentPaidOrders) {
      const cur = (order.currency || "EGP").toUpperCase()
      if (!revenueByCurrency[cur]) {
        revenueByCurrency[cur] = { total_cents: 0, count: 0 }
      }
      const cents = order.total_cents || 0
      revenueByCurrency[cur].total_cents += cents
      revenueByCurrency[cur].count += 1
    }

    // Determine primary currency (EGP preferred if present, otherwise currency with highest revenue)
    const currencies = Object.keys(revenueByCurrency)
    if (currencies.length > 0) {
      if (revenueByCurrency["EGP"]) {
        primaryCurrency = "EGP"
        primaryTotalCents = revenueByCurrency["EGP"].total_cents
      } else {
        primaryCurrency = currencies[0]
        primaryTotalCents = revenueByCurrency[currencies[0]].total_cents
      }
    }

    // Previous period revenue by currency
    const prevRevenueByCurrency: Record<string, { total_cents: number; count: number }> = {}
    let prevPrimaryTotalCents = 0

    for (const order of prevPaidOrders) {
      const cur = (order.currency || "EGP").toUpperCase()
      if (!prevRevenueByCurrency[cur]) {
        prevRevenueByCurrency[cur] = { total_cents: 0, count: 0 }
      }
      prevRevenueByCurrency[cur].total_cents += (order.total_cents || 0)
      prevRevenueByCurrency[cur].count += 1
    }
    if (prevRevenueByCurrency[primaryCurrency]) {
      prevPrimaryTotalCents = prevRevenueByCurrency[primaryCurrency].total_cents
    }

    // 6. Paid orders count and revenue grouped by orders.channel
    const channelStats: Record<string, { count: number; total_cents: number }> = {
      instagram: { count: 0, total_cents: 0 },
      whatsapp: { count: 0, total_cents: 0 },
      facebook: { count: 0, total_cents: 0 },
      telegram: { count: 0, total_cents: 0 },
      tiktok: { count: 0, total_cents: 0 },
      webchat: { count: 0, total_cents: 0 },
    }

    for (const order of currentPaidOrders) {
      const rawCh = (order.channel || "instagram").toLowerCase()
      if (!channelStats[rawCh]) {
        channelStats[rawCh] = { count: 0, total_cents: 0 }
      }
      channelStats[rawCh].count += 1
      channelStats[rawCh].total_cents += (order.total_cents || 0)
    }

    const byChannel = Object.entries(channelStats).map(([channel, stats]) => ({
      channel,
      count: stats.count,
      total_cents: stats.total_cents,
      sharePct:
        currentPaidOrders.length > 0
          ? Math.round((stats.count / currentPaidOrders.length) * 100)
          : 0,
    }))

    // 7. Funnel results
    const currentFunnel = calculateRevenueFunnel({
      comments: commentsCount,
      conversations: convCount,
      leads: currentLeadsCount,
      orders: currentPaidOrders.length,
    })

    const prevFunnel = calculateRevenueFunnel({
      comments: prevCommentsCount,
      conversations: prevConvCount,
      leads: prevLeadsCount,
      orders: prevPaidOrders.length,
    })

    // 8. Period deltas
    const deltas = {
      comments: calculateDelta(commentsCount, prevCommentsCount),
      conversations: calculateDelta(convCount, prevConvCount),
      leads: calculateDelta(currentLeadsCount, prevLeadsCount),
      orders: calculateDelta(currentPaidOrders.length, prevPaidOrders.length),
      revenue: calculateDelta(primaryTotalCents, prevPrimaryTotalCents),
      overallConversion: {
        percent: currentFunnel.overallConversion - prevFunnel.overallConversion,
        formatted: `${currentFunnel.overallConversion >= prevFunnel.overallConversion ? "+" : ""}${(
          currentFunnel.overallConversion - prevFunnel.overallConversion
        ).toFixed(1)}%`,
        direction:
          currentFunnel.overallConversion >= prevFunnel.overallConversion
            ? ("increase" as const)
            : ("decrease" as const),
      },
    }

    return NextResponse.json({
      days,
      period: {
        current: { start: currentStartISO, end: nowISO },
        previous: { start: previousStartISO, end: currentStartISO },
      },
      stages: {
        comments: commentsCount,
        conversations: convCount,
        leads: currentLeadsCount,
        orders: currentPaidOrders.length,
      },
      funnel: currentFunnel,
      revenue: {
        primary: {
          currency: primaryCurrency,
          total_cents: primaryTotalCents,
        },
        byCurrency: revenueByCurrency,
        ...revenueByCurrency,
      },
      byChannel,
      previous: {
        stages: {
          comments: prevCommentsCount,
          conversations: prevConvCount,
          leads: prevLeadsCount,
          orders: prevPaidOrders.length,
        },
        funnel: prevFunnel,
        revenue: {
          primary: {
            currency: primaryCurrency,
            total_cents: prevPrimaryTotalCents,
          },
          byCurrency: prevRevenueByCurrency,
          ...prevRevenueByCurrency,
        },
      },
      deltas,
    })
  } catch (error: any) {
    console.error("[analytics/revenue] GET error:", error)
    return NextResponse.json(
      { error: "Failed to load revenue analytics" },
      { status: 500 }
    )
  }
}
