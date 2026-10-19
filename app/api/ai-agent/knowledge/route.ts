export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { workspaceSession, isMissingTable } from "@/lib/flows/session"
import { saveKnowledge } from "@/lib/ai-agent/ingest"

const KINDS = new Set(["faq", "product", "policy", "website", "document"])

export async function GET(request: NextRequest) {
  const session = await workspaceSession(request)
  if ("response" in session && session.response) return session.response
  
  const { data, error } = await session.supabase
    .from("knowledge_sources")
    .select("id, kind, title, body, source_url, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ sources: [], migration_required: true })
    return NextResponse.json({ error: "Failed to load knowledge" }, { status: 500 })
  }

  return NextResponse.json({ sources: data || [] })
}

export async function POST(request: NextRequest) {
  const session = await workspaceSession(request)
  if ("response" in session && session.response) return session.response
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file" }, { status: 400 })
    if (file.size > 500_000) return NextResponse.json({ error: "File must be under 500KB" }, { status: 400 })
    const { textFromUpload } = await import("@/lib/ai-agent/ingest")
    const text = textFromUpload(file.name, new Uint8Array(await file.arrayBuffer()))
    const saved = await saveKnowledge({
      supabase: session.supabase,
      userId: session.userId,
      workspaceId: session.workspaceId,
      kind: "document",
      title: file.name,
      body: text,
    })
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 })
    return NextResponse.json(saved)
  }
  const body = await request.json().catch(() => ({}))
  const kind = KINDS.has(body.kind) ? body.kind : "faq"
  const saved = await saveKnowledge({
    supabase: session.supabase,
    userId: session.userId,
    workspaceId: session.workspaceId,
    kind,
    title: String(body.title || "Note"),
    body: String(body.body || ""),
    sourceUrl: body.url || null,
  })
  if ("error" in saved) {
    const status = /migration|does not exist|knowledge_sources/i.test(saved.error) ? 503 : 400
    return NextResponse.json({ error: saved.error }, { status })
  }
  return NextResponse.json(saved)
}

export async function PUT(request: NextRequest) {
  const session = await workspaceSession(request)
  if ("response" in session && session.response) return session.response
  const body = await request.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: "Missing source id" }, { status: 400 })

  const title = String(body.title || "").trim()
  const content = String(body.body || "").trim()

  await session.supabase
    .from("knowledge_sources")
    .update({ title, body: content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.userId)

  // Re-index chunks
  try {
    await session.supabase.from("knowledge_chunks").delete().eq("source_id", id).eq("user_id", session.userId)
    const { sourceToChunks } = await import("@/lib/ai-agent/chunk")
    const { embedText, vectorLiteral } = await import("@/lib/ai-agent/embed")
    const pieces = sourceToChunks({ kind: body.kind || "faq", title, body: content })
    for (const piece of pieces) {
      const embedded = await embedText(piece)
      await session.supabase.from("knowledge_chunks").insert({
        source_id: id,
        workspace_id: session.workspaceId || null,
        user_id: session.userId,
        content: piece,
        embedding: vectorLiteral(embedded.vector),
        embedder: embedded.embedder,
      })
    }
  } catch (err) {
    console.warn("[knowledge PUT] reindex error:", err)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await workspaceSession(request)
  if ("response" in session && session.response) return session.response
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing source id" }, { status: 400 })

  await session.supabase.from("knowledge_chunks").delete().eq("source_id", id).eq("user_id", session.userId)
  await session.supabase.from("knowledge_sources").delete().eq("id", id).eq("user_id", session.userId)
  return NextResponse.json({ success: true })
}
