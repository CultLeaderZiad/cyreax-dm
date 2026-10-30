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

        // Fetch conversations sorted by last message
        const { data: conversations, error } = await supabase
            .from("conversations")
            .select("*")
            .eq("user_id", igUserId)
            .order("last_message_at", { ascending: false })

        if (error) throw error

        // Fetch last message for each conversation to show preview
        const convIds = (conversations || []).map((c: any) => c.id)
        let lastMessages: Record<string, string> = {}

        if (convIds.length > 0) {
            // Get the latest message per conversation using a subquery
            const { data: msgs } = await supabase
                .from("messages")
                .select("conversation_id, content")
                .in("conversation_id", convIds)
                .order("created_at", { ascending: false })
                .limit(convIds.length * 3) // Fetch a few per conversation

            if (msgs) {
                // Keep only the first (most recent) message per conversation
                for (const msg of msgs) {
                    if (!lastMessages[msg.conversation_id]) {
                        lastMessages[msg.conversation_id] = msg.content
                    }
                }
            }
        }

        // Fetch contacts with bot_paused = true
        const recipientIds = (conversations || []).map((c: any) => c.recipient_id).filter(Boolean)
        const pausedSet = new Set<string>()

        if (recipientIds.length > 0) {
            const { data: pausedContacts } = await supabase
                .from("contacts")
                .select("external_id, channel, bot_paused")
                .eq("user_id", igUserId)
                .eq("bot_paused", true)
                .in("external_id", recipientIds)

            if (pausedContacts) {
                for (const cnt of pausedContacts) {
                    pausedSet.add(cnt.external_id)
                    if (cnt.channel) pausedSet.add(`${cnt.channel}:${cnt.external_id}`)
                }
            }
        }

        // Enrich conversations with last message preview and bot_paused status
        const enriched = (conversations || []).map((c: any) => ({
            ...c,
            last_message_preview: lastMessages[c.id] || null,
            bot_paused: Boolean(
                c.bot_paused ||
                pausedSet.has(c.recipient_id) ||
                (c.platform && pausedSet.has(`${c.platform}:${c.recipient_id}`))
            ),
        }))

        return NextResponse.json(enriched)
    } catch (error) {
        console.error("[Inbox] Conversations GET error:", error)
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
    }
}

