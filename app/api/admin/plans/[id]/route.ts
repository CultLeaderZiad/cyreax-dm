export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { whopIdsError } from "@/lib/billing/whop"

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin()
  if (adminCheck.response) return adminCheck.response
  
  const params = await props.params
  const id = params.id

  try {
    const body = await request.json()
    const whopError = whopIdsError(body)
    if (whopError) return NextResponse.json({ error: whopError }, { status: 400 })
    const supabase = await getSupabaseBypassClient()

    const { data, error } = await supabase
      .from("plans")
      .update(body)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin()
  if (adminCheck.response) return adminCheck.response

  const params = await props.params
  const id = params.id

  const supabase = await getSupabaseBypassClient()
  const { error } = await supabase
    .from("plans")
    .delete()
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
