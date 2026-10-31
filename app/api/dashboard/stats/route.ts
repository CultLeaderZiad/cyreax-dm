export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { requireSessionUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
    try {
        const result = await requireSessionUser(request)
        if (result.response) return result.response
        const { user: account, igUser } = result
    const igUserId = igUser?.id || account.id

        const supabase = await getSupabaseBypassClient()

        const platformParam = request.nextUrl.searchParams.get("platform")
        const platforms = platformParam
            ? platformParam === "facebook" || platformParam === "messenger"
                ? ["facebook", "messenger"]
                : [platformParam]
            : null

        let automationsQuery = supabase
            .from("automations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", igUserId)
        if (platforms) automationsQuery = automationsQuery.in("platform", platforms)

        let activeTriggersQuery = supabase
            .from("automations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", igUserId)
            .eq("is_active", true)
        if (platforms) activeTriggersQuery = activeTriggersQuery.in("platform", platforms)

        let audienceQuery = supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", igUserId)
        if (platforms) audienceQuery = audienceQuery.in("platform", platforms)

        let messagesQuery = supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", igUserId)
            .eq("direction", "out")
        if (platforms) messagesQuery = messagesQuery.in("platform", platforms)

        let recentMessagesQuery = supabase
            .from("messages")
            .select("id, content, created_at, sender_username, conversation_id, platform, recipient:conversations(recipient_username, platform)")
            .eq("user_id", igUserId)
            .eq("direction", "out")
        if (platforms) recentMessagesQuery = recentMessagesQuery.in("platform", platforms)

        // Run all queries in parallel instead of sequentially
        const [
            automationsResult,
            activeTriggersResult,
            audienceResult,
            messagesResult,
            recentMessagesResult,
            pendingSubmissionsResult,
            subscriptionResult,
        ] = await Promise.all([
            // 1. Total Automations
            automationsQuery,

            // 2. Active Triggers
            activeTriggersQuery,

            // 3. Audience Reached (Total Conversations)
            audienceQuery,

            // 4. Messages Sent (outbound). direction is the source of truth.
            messagesQuery,

            // 5. Recent Activity (Last outbound messages)
            recentMessagesQuery.order("created_at", { ascending: false }).limit(8),

            // 6. Pending payment submissions (merged from client-side paymentStatus)
            supabase
                .from("payment_submissions")
                .select("id")
                .eq("user_id", igUserId)
                .eq("status", "pending")
                .limit(1),

            // 7. Subscription status (merged from client-side paymentStatus)
            supabase
                .from("subscriptions")
                .select("payment_method, current_period_end")
                .eq("user_id", igUserId)
                .single(),
        ])

        let messagesSent = messagesResult.count || 0
        let recentActivity = recentMessagesResult.data || []
        if (messagesResult.error && /direction/i.test(messagesResult.error.message || "")) {
            let legacyQuery = supabase
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("user_id", igUserId)
                .eq("is_from_instagram", false)
            if (platforms) legacyQuery = legacyQuery.in("platform", platforms)
            const legacy = await legacyQuery
            messagesSent = legacy.count || 0

            let legacyRecentQuery = supabase
                .from("messages")
                .select("id, content, created_at, sender_username, conversation_id, platform, recipient:conversations(recipient_username, platform)")
                .eq("user_id", igUserId)
                .eq("is_from_instagram", false)
            if (platforms) legacyRecentQuery = legacyRecentQuery.in("platform", platforms)
            const legacyRecent = await legacyRecentQuery
                .order("created_at", { ascending: false })
                .limit(8)
            recentActivity = legacyRecent.data || []
        }

        // Compute payment status
        const hasPendingSubmission = !!(pendingSubmissionsResult.data && pendingSubmissionsResult.data.length > 0)
        let needsManualRenewal = false
        let daysToRenew = 0

        const sub = subscriptionResult.data
        if (sub && sub.payment_method === 'vodafone_cash' && sub.current_period_end) {
            const diff = new Date(sub.current_period_end).getTime() - Date.now()
            daysToRenew = Math.ceil(diff / (1000 * 60 * 60 * 24))
            if (daysToRenew <= 3 && daysToRenew > 0) {
                needsManualRenewal = true
            }
        }

        return NextResponse.json({
            metrics: {
                totalAutomations: automationsResult.count || 0,
                activeTriggers: activeTriggersResult.count || 0,
                audienceReached: audienceResult.count || 0,
                messagesSent,
            },
            recentActivity,
            paymentStatus: {
                hasPendingSubmission,
                needsManualRenewal,
                daysToRenew,
            },
        })
    } catch (error) {
        console.error("[v0] Dashboard Stats error:", error)
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
    }
}

