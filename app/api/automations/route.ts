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

    const { data, error } = await supabase
      .from("automations")
      .select("*, automation_variants(*)")
      .eq("user_id", igUserId)
      .order("created_at", { ascending: false })

    if (error) throw error

    // Real firing counts for the last 7 days, shown in the automations table.
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: events } = await supabase
      .from("automation_events")
      .select("automation_id")
      .eq("user_id", igUserId)
      .gte("created_at", since)
      .limit(10000)
    const runs: Record<string, number> = {}
    for (const e of events || []) if (e.automation_id) runs[e.automation_id] = (runs[e.automation_id] || 0) + 1

    return NextResponse.json((data || []).map((rule: any) => ({ ...rule, runs_7d: runs[rule.id] || 0 })))
  } catch (error) {
    console.error("[v0] Automations GET error:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    if (result.user.permission_level === "viewer") {
      return NextResponse.json({ error: "Viewers cannot create automations" }, { status: 403 })
    }
    const { user: account, igUser } = result
    const igUserId = igUser?.id || account.id

    const requestBody = await request.json()
    const { name, trigger_source, trigger_type, trigger_value, content, specific_media_id, variants, platform } = requestBody


    if (!name || !trigger_value || !content || !trigger_source) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    if (!['comment', 'dm', 'story'].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()

    const finalTriggerValue =
      trigger_type === "postback"
        ? `PAYLOAD_${Date.now()}_${Math.random().toString(36).substring(7)}`
        : trigger_value.toLowerCase()

    const { data, error } = await supabase
      .from("automations")
      .insert({
        user_id: igUserId,
        name,
        trigger_source,
        trigger_type: trigger_type || "keyword",
        trigger_value: finalTriggerValue,
        response_type: "pro",
        response_content: content,
        is_active: true,
        specific_media_id: specific_media_id || null,
        platform: platform || 'instagram',
        check_follow: requestBody.check_follow || false,
        typing_indicator: requestBody.typing_indicator || false,
        delay_seconds: requestBody.delay_seconds || 0,
      })
      .select()
      .single()

    if (error) throw error

    // Insert variants if provided
    if (variants && Array.isArray(variants) && variants.length > 0) {
      const variantInserts = variants.map((v: any) => ({
        automation_id: data.id,
        variant_name: v.variant_name,
        traffic_weight: v.traffic_weight || 50,
        response_config: v.response_config,
      }))
      const { error: variantError } = await supabase
        .from("automation_variants")
        .insert(variantInserts)
      if (variantError) throw variantError
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[v0] Automations POST error:", error)
    return NextResponse.json({ error: error.message || "Failed to create" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    if (result.user.permission_level === "viewer") {
      return NextResponse.json({ error: "Viewers cannot delete automations" }, { status: 403 })
    }
    const { user: account, igUser } = result
    const igUserId = igUser?.id || account.id

    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()

    // Enforce ownership check: filter delete by both id and user_id
    const { data, error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)
      .eq("user_id", igUserId)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Automation not found or forbidden" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Automations DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    if (result.user.permission_level === "viewer") {
      return NextResponse.json({ error: "Viewers cannot update automations" }, { status: 403 })
    }
    const { user: account, igUser } = result
    const igUserId = igUser?.id || account.id

    const requestBody = await request.json()
    const { id, name, trigger_source, trigger_type, trigger_value, content, specific_media_id, variants, platform } = requestBody

    if (!id || !name || !trigger_value || !content) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    if (trigger_source && !['comment', 'dm', 'story'].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const supabase = await getSupabaseBypassClient()

    const updateData: any = {
      name,
      trigger_type: trigger_type || "keyword",
      trigger_value: trigger_value.toLowerCase(),
      response_content: content,
      specific_media_id: specific_media_id || null,
      platform: platform || 'instagram',
      check_follow: requestBody.check_follow ?? false,
      typing_indicator: requestBody.typing_indicator ?? false,
      delay_seconds: requestBody.delay_seconds ?? 0,
    }

    if (trigger_source) {
      updateData.trigger_source = trigger_source
    }

    const { data, error } = await supabase
      .from("automations")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", igUserId)
      .select()
      .single()

    if (error) throw error

    // Update variants if provided
    if (variants && Array.isArray(variants)) {
      // For simplicity, delete old and insert new
      await supabase.from("automation_variants").delete().eq("automation_id", data.id)
      
      if (variants.length > 0) {
        const variantInserts = variants.map((v: any) => ({
          automation_id: data.id,
          variant_name: v.variant_name,
          traffic_weight: v.traffic_weight || 50,
          response_config: v.response_config,
        }))
        const { error: variantError } = await supabase
          .from("automation_variants")
          .insert(variantInserts)
        if (variantError) throw variantError
      }
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[v0] Automations PUT error:", error)
    return NextResponse.json({ error: error.message || "Failed to update" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const result = await requireSessionUser(request)
    if (result.response) return result.response
    if (result.user.permission_level === "viewer") {
      return NextResponse.json({ error: "Viewers cannot modify automations" }, { status: 403 })
    }
    const { user: account, igUser } = result
    const igUserId = igUser?.id || account.id

    const { id, is_active, action } = await request.json()
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const supabase = await getSupabaseBypassClient()

    if (action === "duplicate") {
      const { data: original, error: fetchError } = await supabase
        .from("automations")
        .select("*")
        .eq("id", id)
        .eq("user_id", igUserId)
        .single()
      if (fetchError || !original) return NextResponse.json({ error: "Not found" }, { status: 404 })

      const { id: _id, created_at, updated_at, ...rest } = original
      const { data, error } = await supabase
        .from("automations")
        .insert({ ...rest, name: `${original.name} (copy)`, is_active: false })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Missing is_active" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("automations")
      .update({ is_active })
      .eq("id", id)
      .eq("user_id", igUserId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Automations PATCH error:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

