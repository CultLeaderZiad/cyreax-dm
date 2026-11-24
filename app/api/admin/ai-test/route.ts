export const dynamic = "force-dynamic"
export const maxDuration = 60

import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"

/**
 * GET /api/admin/ai-test (admins only)
 *
 * Calls Gemini and Groq once each, from the live server with its own
 * environment variables, and reports which model answered. It never returns
 * a key or any part of one. Open it in the browser while signed in as admin.
 */
async function probe(name: string, run: () => Promise<Response>) {
  const started = Date.now()
  try {
    const res = await run()
    const ok = res.ok
    const body = await res.text()
    return {
      provider: name,
      ok,
      status: res.status,
      ms: Date.now() - started,
      problem: ok ? null : body.replace(/key=[^&\s"]+/gi, "key=…").slice(0, 200),
    }
  } catch (error) {
    return { provider: name, ok: false, status: 0, ms: Date.now() - started, problem: String((error as Error)?.message || error).slice(0, 200) }
  }
}

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request)
  if (result.response) return result.response

  const geminiKey = process.env.GEMINI_API_KEY
  const groqKey = process.env.GROQ_API_KEY
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-lite-latest"
  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

  const checks = await Promise.all([
    geminiKey
      ? probe(`gemini:${geminiModel}`, () =>
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with: OK" }] }], generationConfig: { maxOutputTokens: 20 } }),
            signal: AbortSignal.timeout(20_000),
          }),
        )
      : Promise.resolve({ provider: "gemini", ok: false, status: 0, ms: 0, problem: "GEMINI_API_KEY is not set in this deployment" }),
    groqKey
      ? probe(`groq:${groqModel}`, () =>
          fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: "Reply with: OK" }], max_tokens: 50 }),
            signal: AbortSignal.timeout(20_000),
          }),
        )
      : Promise.resolve({ provider: "groq", ok: false, status: 0, ms: 0, problem: "GROQ_API_KEY is not set in this deployment" }),
  ])

  return NextResponse.json({ ok: checks.some((c) => c.ok), checks })
}
