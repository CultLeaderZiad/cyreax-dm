import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { readFileSync } from "node:fs"

process.env.BYOK_ENCRYPTION_SECRET ||= "test-secret-for-token-sealing-0123456789"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const { sealAccessToken } = await import("../lib/token-crypto.ts")
const { parseTelegramPathSegment, telegramWebhookSecret, telegramWebhookUrl } = await import("../lib/telegram-webhook.ts")
const route = await import("../app/api/telegram/webhook/[token]/route.ts")

const TOKEN = "123456789:AAH-realistic_bot_token_value_xyz"
const BOT = "123456789"

function seed(metadata: Record<string, unknown> = {}) {
  fakeDb().tables = {
    platform_connections: [
      { id: "tg1", user_id: 1001, platform: "telegram", page_id: BOT, external_account_id: BOT, access_token: sealAccessToken(TOKEN), metadata },
    ],
    inbound_events: [],
  }
}

const post = (segment: string, headers: Record<string, string> = {}) =>
  route.POST(
    new NextRequest(`https://app.test/api/telegram/webhook/${segment}`, {
      method: "POST",
      body: JSON.stringify({ update_id: 1, message: { text: "hi" } }),
      headers: { "content-type": "application/json", ...headers },
    }),
    { params: Promise.resolve({ token: segment }) },
  )

describe("telegram webhook no longer needs the bot token in the URL", () => {
  beforeEach(() => seed({ webhook_secret_v2: true }))

  it("registered URL contains the bot id, never the token", () => {
    const url = telegramWebhookUrl("https://app.test/", BOT)
    assert.equal(url, "https://app.test/api/telegram/webhook/123456789")
    assert.ok(!url.includes(TOKEN.split(":")[1]))
    const connect = readFileSync("app/api/telegram/connect/route.ts", "utf8")
    assert.doesNotMatch(connect, /webhook\/\$\{botToken\}/)
    assert.match(connect, /telegramWebhookSecret\(botToken\)/)
  })

  it("parses bot-id and legacy token path segments, rejects junk", () => {
    assert.deepEqual(parseTelegramPathSegment(BOT), { botId: BOT, legacyToken: null })
    assert.deepEqual(parseTelegramPathSegment(TOKEN), { botId: BOT, legacyToken: TOKEN })
    assert.equal(parseTelegramPathSegment("../etc"), null)
  })

  it("rejects a delivery without or with a wrong secret header", async () => {
    assert.equal((await post(BOT)).status, 401)
    assert.equal((await post(BOT, { "x-telegram-bot-api-secret-token": "nope" })).status, 401)
    assert.equal((await post(BOT, { "x-telegram-bot-api-secret-token": telegramWebhookSecret("other:token") })).status, 401)
  })

  it("accepts the right secret and queues the update", async () => {
    const res = await post(BOT, { "x-telegram-bot-api-secret-token": telegramWebhookSecret(TOKEN) })
    assert.notEqual(res.status, 401)
    assert.equal(fakeDb().tables.inbound_events.length, 1)
  })

  it("refuses the legacy token path once the bot is migrated", async () => {
    assert.equal((await post(TOKEN)).status, 401)
    assert.equal(fakeDb().tables.inbound_events.length, 0)
  })

  it("still accepts the legacy path for a bot that is not migrated yet, then migrates it", async () => {
    seed({})
    const realFetch = globalThis.fetch
    const calls: Array<{ url: string; body: any }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
    try {
      const res = await post(TOKEN)
      assert.notEqual(res.status, 401)
    } finally {
      globalThis.fetch = realFetch
    }
    assert.equal(fakeDb().tables.inbound_events.length, 1)
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /\/setWebhook$/)
    assert.equal(calls[0].body.url, "https://app.test/api/telegram/webhook/123456789")
    assert.equal(calls[0].body.secret_token, telegramWebhookSecret(TOKEN))
    assert.equal(fakeDb().tables.platform_connections[0].metadata.webhook_secret_v2, true)
  })
})
