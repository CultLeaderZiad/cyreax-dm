import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { readFileSync } from "node:fs"

const { isModelGone } = await import("../lib/llm-errors.ts")

describe("retired model detection", () => {
  it("recognises the errors providers send for a model that no longer exists", () => {
    assert.equal(isModelGone(404, ""), true)
    assert.equal(isModelGone(400, '{"error":{"code":"model_not_found","message":"The model `x` does not exist or you do not have access to it."}}'), true)
    assert.equal(isModelGone(404, "This model models/gemini-2.5-flash is no longer available to new users."), true)
    assert.equal(isModelGone(400, "The model has been decommissioned"), true)
  })

  it("does not treat busy or auth errors as a retired model", () => {
    assert.equal(isModelGone(503, "This model is currently experiencing high demand."), false)
    assert.equal(isModelGone(429, "rate limit"), false)
    assert.equal(isModelGone(401, "invalid api key"), false)
  })
})

describe("provider defaults", () => {
  const src = readFileSync("lib/llm-provider.ts", "utf8")

  it("no longer defaults to the retired Groq model", () => {
    assert.ok(!src.includes('"llama-3.1-8b-instant"'))
    assert.match(src, /DEFAULT_GROQ_MODEL = process\.env\.GROQ_MODEL \|\| "openai\/gpt-oss-120b"/)
  })

  it("Gemini is tried first and its key is sent in a header, never the URL", () => {
    assert.ok(src.indexOf('{ provider: "gemini", key: GEMINI_API_KEY }') < src.indexOf('{ provider: "groq", key: GROQ_API_KEY }'))
    assert.ok(!src.includes("?key=${apiKey}"))
    assert.ok(src.includes('"x-goog-api-key": apiKey'))
  })
})
