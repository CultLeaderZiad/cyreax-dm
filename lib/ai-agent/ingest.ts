import { sourceToChunks, htmlToText, extractPdfText } from "@/lib/ai-agent/chunk"
import { embedText, vectorLiteral } from "@/lib/ai-agent/embed"
import { resolvesToPublicHost } from "@/lib/net/public-host"
import type { Db } from "@/lib/channels/types"

export async function saveKnowledge(input: {
  supabase: Db
  userId: string | number
  workspaceId?: string | null
  kind: "faq" | "product" | "policy" | "website" | "document"
  title: string
  body: string
  sourceUrl?: string | null
}): Promise<{ id: string; chunks: number } | { error: string }> {
  const body = input.body.trim().slice(0, 20000)
  if (!body) return { error: "Nothing to store" }
  const created = await input.supabase
    .from("knowledge_sources")
    .insert({
      workspace_id: input.workspaceId || null,
      user_id: input.userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body,
      source_url: input.sourceUrl || null,
    })
    .select("id")
    .maybeSingle()
  if (created.error || !created.data?.id) return { error: created.error?.message || "Could not store the source" }
  const pieces = sourceToChunks({ kind: input.kind, title: input.title, body })
  let stored = 0
  for (const content of pieces) {
    const embedded = await embedText(content)
    const row = await input.supabase.from("knowledge_chunks").insert({
      source_id: created.data.id,
      workspace_id: input.workspaceId || null,
      user_id: input.userId,
      content,
      embedding: vectorLiteral(embedded.vector),
      embedder: embedded.embedder,
    })
    if (!row.error) stored += 1
  }
  return { id: created.data.id, chunks: stored }
}

export async function importWebsite(
  url: string,
  fetchImpl: typeof fetch = fetch,
  checkHost: (url: string) => Promise<boolean> = resolvesToPublicHost,
): Promise<{ title: string; body: string } | { error: string }> {
  if (!(await checkHost(url))) return { error: "URL must be https on a public host" }
  const response = await fetchImpl(url, { redirect: "manual" })
  if (response.status >= 300 && response.status < 400) return { error: "Redirects are not followed" }
  if (!response.ok) return { error: `The site returned ${response.status}` }
  const html = await response.text()
  const body = htmlToText(html)
  if (body.length < 40) return { error: "That page did not contain enough text" }
  const title = html.match(/<title>([^<]{1,160})<\/title>/i)?.[1]?.trim() || url
  return { title, body }
}

export function textFromUpload(filename: string, bytes: Uint8Array): string {
  if (filename.toLowerCase().endsWith(".pdf")) return extractPdfText(bytes)
  return new TextDecoder().decode(bytes)
}
