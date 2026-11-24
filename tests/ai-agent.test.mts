import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { runAgent, extractJson } = await import("../lib/ai/agent/loop.ts")

const tool = (name: string, run: () => Promise<unknown> = async () => ({ ok: 1 })) => ({
  name, description: "d", args: {},
  parse: (raw: any) => (raw && raw.bad ? { ok: false as const, error: "bad args" } : { ok: true as const, value: raw || {} }),
  run,
})
const script = (...replies: Array<string | null | Error>) => {
  const seen: any[] = []
  let i = 0
  return { seen, llm: async (m: any) => { seen.push(m); const r = replies[Math.min(i++, replies.length - 1)]; if (r instanceof Error) throw r; return r } }
}

describe("agent loop", () => {
  it("calls a tool, feeds the result back, then answers", async () => {
    const s = script('{"tool":"get","args":{}}', '{"final":"You have 3 waiting."}')
    const out = await runAgent({ message: "hi", tools: [tool("get", async () => ({ waiting: 3 }))], llm: s.llm })
    assert.equal(out.reply, "You have 3 waiting.")
    assert.deepEqual(out.steps, [{ tool: "get", ok: true }])
    assert.ok(s.seen[1].some((m: any) => m.content.includes("TOOL_RESULT(get)") && m.content.includes('"waiting":3')))
  })
  it("tolerates fences and prose around the JSON", () => {
    assert.deepEqual(extractJson('Sure!\n```json\n{"final":"x {y}"}\n```'), { final: "x {y}" })
    assert.equal(extractJson("no json"), null)
  })
  it("an unknown tool is refused and reported back, not run", async () => {
    const s = script('{"tool":"drop_tables"}', '{"final":"ok"}')
    const out = await runAgent({ message: "x", tools: [tool("get")], llm: s.llm })
    assert.deepEqual(out.steps, [{ tool: "drop_tables", ok: false }])
    assert.ok(s.seen[1].some((m: any) => m.content.includes("no tool named")))
  })
  it("invalid arguments never reach the tool", async () => {
    let ran = false
    const s = script('{"tool":"get","args":{"bad":1}}', '{"final":"ok"}')
    await runAgent({ message: "x", tools: [tool("get", async () => { ran = true })], llm: s.llm })
    assert.equal(ran, false)
  })
  it("stops after the step limit", async () => {
    const s = script('{"tool":"get"}')
    const out = await runAgent({ message: "x", tools: [tool("get")], llm: s.llm, limits: { maxSteps: 3 } })
    assert.equal(out.stopped, "max_steps")
    assert.equal(out.steps.length, 3)
  })
  it("stops at the time limit", async () => {
    let t = 0
    const s = script('{"tool":"get"}')
    const out = await runAgent({ message: "x", tools: [tool("get")], llm: s.llm, limits: { maxMs: 1000 }, now: () => (t += 600) })
    assert.equal(out.stopped, "timeout")
  })
  it("large tool results are truncated before the model sees them", async () => {
    const s = script('{"tool":"get"}', '{"final":"ok"}')
    await runAgent({ message: "x", tools: [tool("get", async () => "a".repeat(50_000))], llm: s.llm, limits: { maxToolChars: 500 } })
    const result = s.seen[1].find((m: any) => m.content.startsWith("TOOL_RESULT")).content
    assert.ok(result.length < 700 && result.includes("[truncated]"))
  })
  it("a provider failure becomes a friendly error, plain text becomes the answer", async () => {
    assert.equal((await runAgent({ message: "x", tools: [], llm: script(new Error("429")).llm })).stopped, "error")
    assert.equal((await runAgent({ message: "x", tools: [], llm: script("Just text").llm })).reply, "Just text")
  })
})
