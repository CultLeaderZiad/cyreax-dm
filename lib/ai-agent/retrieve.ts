import { cosineSimilarity } from "@/lib/ai-agent/embed"

export interface KnowledgeChunk {
  id: string
  sourceId?: string | null
  title?: string | null
  content: string
  embedding: number[]
  embedder: string
}

export interface RetrievedChunk {
  id: string
  sourceId?: string | null
  title?: string | null
  content: string
  similarity: number
}

function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // remove tashkeel/diacritics
    .replace(/[^\w\u0600-\u06FF]+/g, " ")
    .trim()
}

export function computeLexicalOverlap(queryText: string, targetText: string): number {
  const normQuery = normalizeArabicText(queryText)
  const normTarget = normalizeArabicText(targetText)
  if (!normQuery || !normTarget) return 0

  const queryTokens = normQuery.split(/\s+/).filter((t) => t.length > 1)
  if (queryTokens.length === 0) return 0

  let matches = 0
  for (const token of queryTokens) {
    if (normTarget.includes(token)) {
      matches += 1
    }
  }

  return matches / queryTokens.length
}

export function rankChunks(
  query: number[],
  chunks: KnowledgeChunk[],
  embedder: string,
  limit = 4,
  queryText?: string
): RetrievedChunk[] {
  return chunks
    .filter((chunk) => chunk.embedder === embedder && chunk.embedding.length === query.length)
    .map((chunk) => {
      const cosine = cosineSimilarity(query, chunk.embedding)
      let score = cosine

      if (queryText) {
        const lexical = computeLexicalOverlap(queryText, `${chunk.title || ""} ${chunk.content}`)
        if (lexical > 0.3) {
          // Boost score strongly when lexical keywords match so Q&A questions aren't treated as off-topic
          score = Math.max(cosine, 0.45 + lexical * 0.5)
        }
      }

      return {
        id: chunk.id,
        sourceId: chunk.sourceId,
        title: chunk.title,
        content: chunk.content,
        similarity: Number(Math.min(0.99, score).toFixed(4)),
      }
    })
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
}
