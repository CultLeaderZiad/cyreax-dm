export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

export async function GET(request: Request) {
    try {
        const nextReq = request as any
        const result = await requireSessionUser(nextReq)
        if (result.response) return result.response
        const { user: account, igUser } = result

        const { searchParams } = new URL(request.url)
        const paramUserId = searchParams.get("userId")

        // Resolve the business user row — ai_enabled/ai_context live on the
        // `users` table (int64 id), NOT the accounts UUID. Previously this
        // route queried users by account.id, so the toggle/context the user
        // saved was never read back correctly (AI looked "fake"/always off).
        const supabase = await getSupabaseBypassClient()

        let userRowId: any = igUser?.id
        if (!userRowId) {
            const { data: u } = await supabase
                .from("users")
                .select("id")
                .eq("account_id", account.id)
                .maybeSingle()
            userRowId = u?.id
        }

        if (paramUserId && userRowId && paramUserId !== userRowId.toString()) {
            return NextResponse.json({ error: "Unauthorized userId" }, { status: 403 })
        }

        if (!userRowId) {
            return NextResponse.json({ enabled: false, ai_context: "" })
        }

        const { data, error } = await supabase
            .from("users")
            .select("ai_enabled, ai_context")
            .eq("id", userRowId)
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            enabled: data?.ai_enabled ?? false,
            ai_context: data?.ai_context ?? ""
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const nextReq = request as any
        const result = await requireSessionUser(nextReq)
        if (result.response) return result.response
        const { user: account, igUser } = result

        const body = await request.json()
        const { userId, enabled, ai_context } = body

        const supabase = await getSupabaseBypassClient()

        let userRowId: any = igUser?.id
        if (!userRowId) {
            const { data: u } = await supabase
                .from("users")
                .select("id")
                .eq("account_id", account.id)
                .maybeSingle()
            userRowId = u?.id
        }

        if (!userRowId) {
            return NextResponse.json({ error: "No business profile found. Connect a platform first." }, { status: 400 })
        }

        if (userId && userId.toString() !== userRowId.toString()) {
            return NextResponse.json({ error: "Unauthorized userId" }, { status: 403 })
        }

        const updateData: any = {}
        if (enabled !== undefined) updateData.ai_enabled = enabled
        if (ai_context !== undefined) updateData.ai_context = ai_context

        const { error } = await supabase
            .from("users")
            .update(updateData)
            .eq("id", userRowId)
            .eq("account_id", account.id)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

