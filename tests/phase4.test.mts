import assert from "node:assert/strict"
import crypto from "node:crypto"
import { describe, it } from "node:test"

const { pickChannelConnection } = await import("../lib/channels/pick-connection.ts")
const { createTikTokAdapter, createWebchatAdapter, createWhatsAppAdapter, getAdapter } = await import("../lib/channels/adapters.ts")
const { normalizeWhatsAppBody } = await import("../lib/channels/normalize.ts")
const { normalizeTikTokWebhook } = await import("../lib/tiktok/events.ts")
const { verifyTikTokSignature } = await import("../lib/tiktok/signature.ts")
const { bodyParameterCount, buildTemplatePayload, sendWhatsAppTemplate } = await import("../lib/whatsapp/templates.ts")
const { openAccessToken } = await import("../lib/token-crypto.ts")
const {
  deregisterPhoneNumber,
  fetchPhoneNumber,
  isPhoneNumberRegistered,
  preparePhoneRegistration,
  registerPhoneNumber,
  registrationFailureMessage,
  registrationPinCipherToStore,
  releaseWhatsAppConnection,
  shouldUnsubscribeWaba,
  unsubscribeWaba,
  wabaIdFromConnection,
  wabaIdsFromDebugToken,
} = await import("../lib/whatsapp/connect.ts")
const {
  embeddedSignupLoginOptions,
  logUnknownEmbeddedSignupOnce,
  metadataWithoutRegistrationPin,
  parseEmbeddedSignupMessage,
  resetEmbeddedSignupShapeLog,
} = await import("../lib/whatsapp/embedded-signup.ts")
const { originAllowed, consumeWebchatRate } = await import("../lib/webchat/security.ts")
const { hashVisitorSecret } = await import("../lib/webchat/security.ts")
const { listWebchatMessages, openWebchatSession, postWebchatMessage } = await import("../lib/webchat/service.ts")

// Test fakes stand in for fetch/Response; typed loosely on purpose.
function jsonResponse(json: any, ok = true, status = 200): any {
  return { ok, status, json: async () => json }
}

function captureFetch(responder: any): { fetchImpl: any; calls: any[] } {
  const calls: any[] = []
  const fetchImpl = async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    const result = await responder(String(url), init, calls.length)
    return jsonResponse(result.json, result.ok !== false, result.status || 200)
  }
  return { fetchImpl, calls }
}

describe("phase 4 connection routing", () => {
  it("never guesses the first WhatsApp number", () => {
    const rows = [{ page_id: "111" }, { page_id: "222" }]
    assert.equal(pickChannelConnection(rows, "222").row!.page_id, "222")
    assert.equal(pickChannelConnection([{ page_id: "111" }], null).row!.page_id, "111")
    assert.equal(pickChannelConnection(rows, null).ambiguous, true)
    assert.equal(pickChannelConnection(rows, null).row, null)
    assert.equal(pickChannelConnection(rows, "999").row, null)
    assert.equal(pickChannelConnection([], "111").ambiguous, false)
  })
})

describe("WhatsApp adapter and templates", () => {
  const ctx = { accessToken: "token", recipientId: "15551212", senderRef: "phone-1" }

  it("sends text, buttons, lists, and media through the phone number id", async () => {
    const { fetchImpl, calls } = captureFetch(async () => ({ json: { messages: [{ id: "wamid.1" }] } }))
    const adapter = createWhatsAppAdapter(fetchImpl)
    assert.equal((await adapter.sendText(ctx, "hello")).ok, true)
    assert.equal(JSON.parse(calls[0].init.body).type, "text")
    assert.match(calls[0].url, /\/phone-1\/messages$/)

    await adapter.sendText(ctx, "pick", [{ title: "Yes", payload: "yes" }, { title: "No", payload: "no" }])
    const buttons = JSON.parse(calls[1].init.body)
    assert.equal(buttons.interactive.type, "button")
    assert.equal(buttons.interactive.action.buttons.length, 2)

    await adapter.sendText(ctx, "more", [
      { title: "One", payload: "1" },
      { title: "Two", payload: "2" },
      { title: "Three", payload: "3" },
      { title: "Four", payload: "4" },
    ])
    assert.equal(JSON.parse(calls[2].init.body).interactive.type, "list")

    await adapter.sendMedia(ctx, { type: "document", url: "https://example.com/a.pdf" }, "invoice")
    const media = JSON.parse(calls[3].init.body)
    assert.equal(media.type, "document")
    assert.equal(media.document.link, "https://example.com/a.pdf")
    assert.equal(media.document.caption, "invoice")

    await adapter.sendList!(ctx, {
      body: "Choose",
      button: "Menu",
      sections: [{ title: "Main", rows: [{ id: "a", title: "Alpha", description: "First" }] }],
    })
    assert.equal(JSON.parse(calls[4].init.body).interactive.action.button, "Menu")

    const missing = await adapter.sendText({ ...ctx, senderRef: "" }, "nope")
    assert.equal(missing.ok, false)
    assert.equal(calls.length, 5)
  })

  it("normalizes inbound media and template buttons without using the phone id as the recipient", () => {
    const events = normalizeWhatsAppBody({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-1" },
            contacts: [{ profile: { name: "Nour" } }],
            messages: [
              { from: "1555", id: "m1", type: "image", image: { caption: "look" }, timestamp: "10" },
              { from: "1555", id: "m2", type: "button", button: { payload: "YES", text: "Yes" }, timestamp: "11" },
            ],
          },
        }],
      }],
    })
    assert.equal(events[0].text, "[image] look")
    assert.equal(events[0].contactExternalId, "1555")
    assert.equal(events[0].chatId, undefined)
    assert.equal(events[0].accountRef, "phone-1")
    assert.equal(events[1].kind, "postback")
    assert.equal(events[1].text, "YES")
  })

  it("builds and sends an approved template payload", async () => {
    const components = [{ type: "BODY", text: "Hi {{1}}, code {{2}}" }]
    assert.equal(bodyParameterCount(components), 2)
    const payload: any = buildTemplatePayload({ to: "1555", name: "hello", language: "ar", bodyParameters: ["Nour", "9"] })
    assert.equal(payload.type, "template")
    assert.equal(payload.template.language.code, "ar")
    assert.equal(payload.template.components[0].parameters.length, 2)

    const { fetchImpl, calls } = captureFetch(async () => ({ json: { messages: [{ id: "wamid.t" }] } }))
    const sent = await sendWhatsAppTemplate(fetchImpl, {
      phoneNumberId: "phone-9",
      accessToken: "token",
      to: "1555",
      name: "hello",
      language: "en_US",
    })
    assert.equal(sent.ok, true)
    assert.equal(sent.id, "wamid.t")
    assert.match(calls[0].url, /\/phone-9\/messages$/)
    assert.equal(calls[0].init.headers.Authorization, "Bearer token")
  })

  it("reads WABA ids from an Embedded Signup debug token", () => {
    const ids = wabaIdsFromDebugToken({
      data: {
        granular_scopes: [
          { scope: "whatsapp_business_management", target_ids: ["waba-1"] },
          { scope: "public_profile", target_ids: ["ignore"] },
        ],
      },
    })
    assert.deepEqual(ids, ["waba-1"])
  })
})

describe("TikTok adapter", () => {
  it("sends a conversation message and a comment direct reply only when the flags allow it", async () => {
    const previousMessaging = process.env.TIKTOK_MESSAGING_ENABLED
    const previousComment = process.env.TIKTOK_COMMENT_TO_DM_ENABLED
    process.env.TIKTOK_MESSAGING_ENABLED = ""
    process.env.TIKTOK_COMMENT_TO_DM_ENABLED = ""
    try {
      const { fetchImpl, calls } = captureFetch(async () => ({ json: { code: 0, data: { message: { message_id: "tt-1" } } } }))
      const adapter = createTikTokAdapter(fetchImpl)
      const blocked = await adapter.sendText({ accessToken: "tok", recipientId: "conv-1", senderRef: "open-1" }, "hi")
      assert.equal(blocked.error, "tiktok_messaging_disabled")
      assert.equal(calls.length, 0)

      process.env.TIKTOK_MESSAGING_ENABLED = "true"
      const sent = await adapter.sendText({ accessToken: "tok", recipientId: "conv-1", senderRef: "open-1" }, "hi")
      assert.equal(sent.id, "tt-1")
      const body = JSON.parse(calls[0].init.body)
      assert.equal(body.recipient_type, "CONVERSATION")
      assert.equal(body.recipient, "conv-1")
      assert.equal(body.business_id, "open-1")
      assert.equal(calls[0].init.headers["Access-Token"], "tok")

      const commentOff = await adapter.privateReply!({ accessToken: "tok", recipientId: "", senderRef: "open-1", commentId: "c1" }, "thanks")
      assert.equal(commentOff.error, "tiktok_comment_to_dm_disabled")

      process.env.TIKTOK_COMMENT_TO_DM_ENABLED = "true"
      const comment = await adapter.privateReply!({ accessToken: "tok", recipientId: "", senderRef: "open-1", commentId: "c1" }, "thanks")
      assert.equal(comment.ok, true)
      const direct = JSON.parse(calls[1].init.body)
      assert.equal(direct.direct_reply.reply_type, "COMMENT_REPLY")
      assert.equal(direct.direct_reply.comment_reply.comment_id, "c1")

      const media = await adapter.sendMedia({ accessToken: "tok", recipientId: "conv-1", senderRef: "open-1" }, { type: "image", url: "https://example.com/a.jpg" })
      assert.equal(media.ok, false)
    } finally {
      if (previousMessaging === undefined) delete process.env.TIKTOK_MESSAGING_ENABLED
      else process.env.TIKTOK_MESSAGING_ENABLED = previousMessaging
      if (previousComment === undefined) delete process.env.TIKTOK_COMMENT_TO_DM_ENABLED
      else process.env.TIKTOK_COMMENT_TO_DM_ENABLED = previousComment
    }
  })

  it("normalizes a DM and a high-intent comment, and checks the webhook signature", () => {
    const dm = normalizeTikTokWebhook({
      event: "im_receive_msg",
      user_openid: "biz-1",
      content: JSON.stringify({
        unique_identifier: "user-9",
        conversation_id: "conv-9",
        message_id: "m9",
        type: "text",
        text: { body: "price" },
        from_user: { id: "u", role: "personal_account" },
        from: "nour",
      }),
    })
    assert.equal(dm[0].kind, "dm")
    assert.equal(dm[0].text, "price")
    assert.equal(dm[0].chatId, "conv-9")
    assert.equal(dm[0].accountRef, "biz-1")

    const comment = normalizeTikTokWebhook({
      event: "im_receive_high_intent_comment",
      user_openid: "biz-1",
      content: { unique_identifier: "user-9", comment_id: "c9", comment_text: "price", from_user: { role: "personal_account" } },
    })
    assert.equal(comment[0].kind, "comment")
    assert.equal(comment[0].commentId, "c9")

    const echo = normalizeTikTokWebhook({
      event: "im_send_msg",
      user_openid: "biz-1",
      content: { unique_identifier: "user-9", message_id: "echo", type: "text", text: { body: "out" }, from_user: { role: "business_account" } },
    })
    assert.equal(echo.length, 0)

    const raw = "{\"ok\":true}"
    const stamp = "1700000000"
    const secret = "client-secret"
    const signature = crypto.createHmac("sha256", secret).update(`${stamp}.${raw}`).digest("hex")
    assert.equal(verifyTikTokSignature(raw, `t=${stamp},s=${signature}`, secret, 1700000100), true)
    assert.equal(verifyTikTokSignature(raw, `t=${stamp},s=${signature}`, secret, 1700000401), false)
    assert.equal(verifyTikTokSignature(raw, `t=${stamp},s=${"0".repeat(signature.length)}`, secret, 1700000100), false)
  })
})

describe("website chat widget", () => {
  it("allows only listed domains and rate limits sends", () => {
    assert.equal(originAllowed("https://shop.example.com", ["example.com"]), false)
    assert.equal(originAllowed("https://shop.example.com", ["*.example.com"]), true)
    assert.equal(originAllowed("https://example.com", ["*.example.com"]), true)
    assert.equal(originAllowed("https://evil.com", []), false)
    assert.equal(originAllowed(null, ["example.com"]), false)
    const first = consumeWebchatRate(null, 1_000, 1, 60_000)
    const second = consumeWebchatRate(first.bucket, 1_500, 1, 60_000)
    assert.equal(first.allowed, true)
    assert.equal(second.allowed, false)
  })

  it("issues a visitor secret, rejects another visitor's secret, and rate limits the message endpoint", async () => {
    const widget = {
      id: "widget-1",
      user_id: 7,
      workspace_id: null,
      public_key: "wk_test",
      name: "Chat",
      greeting: "أهلا",
      color: "#111111",
      locale: "ar",
      allowed_domains: ["example.com"],
      enabled: true,
    }
    const visitors = new Map()
    const rates = new Map()
    const inbound: any[] = []
    const greetings: any[] = []
    const gateway: any = {
      async widgetByKey(key: any) { return key === widget.public_key ? widget : null },
      async visitor(_widgetId: any, visitorId: any) { return visitors.get(visitorId) || null },
      async createVisitor(input: any) { visitors.set(input.visitorId, { secret_hash: input.secretHash }) },
      async rate(key: any) { return rates.get(key) || null },
      async saveRate(key: any, bucket: any) { rates.set(key, bucket) },
      async messages(_widget: any, visitorId: any) {
        return [{ id: `m-${visitorId}`, content: "only this visitor", direction: "out", created_at: "2026-09-30T00:00:00.000Z" }]
      },
      async acceptInbound(_widget: any, visitorId: any, text: any, messageId: any) { inbound.push({ visitorId, text, messageId }) },
      async greet(_widget: any, visitorId: any, text: any) { greetings.push({ visitorId, text }) },
    }
    const caller = { origin: "https://example.com", ip: "203.0.113.4", now: 5_000 }

    const denied = await openWebchatSession(gateway, { ...caller, origin: "https://evil.test" }, { publicKey: widget.public_key })
    assert.equal(denied.status, 403)
    assert.equal(denied.cors, false)

    const opened = await openWebchatSession(gateway, caller, { publicKey: widget.public_key })
    assert.equal(opened.status, 200)
    assert.equal(greetings.length, 1)
    assert.equal(typeof opened.body.secret, "string")
    const visitorId = String(opened.body.visitorId)
    const secret = String(opened.body.secret)

    const other = hashVisitorSecret("not-the-secret")
    visitors.set("someone-else", { secret_hash: other })
    const leaked = await listWebchatMessages(gateway, caller, { publicKey: widget.public_key, visitorId: "someone-else", secret })
    assert.equal(leaked.status, 401)

    const listed = await listWebchatMessages(gateway, caller, { publicKey: widget.public_key, visitorId, secret })
    assert.equal((listed.body.messages as Array<{ id: string }>)[0].id, `m-${visitorId}`)

    const sent = await postWebchatMessage(gateway, { ...caller, sendLimit: 1 }, {
      publicKey: widget.public_key,
      visitorId,
      secret,
      text: "price",
    })
    assert.equal(sent.status, 200)
    assert.equal(inbound[0].text, "price")
    assert.equal(inbound[0].visitorId, visitorId)
    const limited = await postWebchatMessage(gateway, { ...caller, sendLimit: 1, now: 6_000 }, {
      publicKey: widget.public_key,
      visitorId,
      secret,
      text: "again",
    })
    assert.equal(limited.status, 429)
    assert.equal(getAdapter("webchat")?.channel, "webchat")
    assert.equal((await createWebchatAdapter().sendText({ accessToken: "webchat_managed", recipientId: visitorId }, "ok")).ok, true)
  })
})

describe("WhatsApp Embedded Signup v4 and registration", () => {
  it("launches v4 without sessionInfoVersion and reads the documented finish payload", () => {
    const options = embeddedSignupLoginOptions("cfg-v4")
    assert.equal(options.config_id, "cfg-v4")
    assert.equal(options.response_type, "code")
    assert.equal(options.override_default_response_type, true)
    assert.deepEqual(options.extras, { setup: {} })
    assert.equal("sessionInfoVersion" in options.extras, false)
    assert.equal(JSON.stringify(options).includes("sessionInfoVersion"), false)

    const finish = parseEmbeddedSignupMessage(JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { phone_number_id: "106540352242922", waba_id: "524126980791429", business_id: "2729063490586005" },
    }))
    assert.equal(finish.kind, "session")
    if (finish.kind !== "session") return
    assert.equal(finish.phoneNumberId, "106540352242922")
    assert.equal(finish.wabaId, "524126980791429")

    const onlyWaba = parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      data: { waba_ids: ["524126980791429"] },
    })
    assert.equal(onlyWaba.kind, "session")
    if (onlyWaba.kind !== "session") return
    assert.equal(onlyWaba.phoneNumberId, undefined)
    assert.equal(onlyWaba.wabaId, "524126980791429")

    const cancelled = parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
      data: { error_message: "Name rejected", error_code: "524126" },
    })
    assert.equal(cancelled.kind, "cancel")
    if (cancelled.kind !== "cancel") return
    assert.equal(cancelled.message, "Name rejected")

    assert.equal(parseEmbeddedSignupMessage({ type: "other" }).kind, "ignore")
    assert.equal(parseEmbeddedSignupMessage("not-json").kind, "ignore")
  })

  it("logs an unknown Embedded Signup shape once and still keeps any ids it could read", () => {
    resetEmbeddedSignupShapeLog()
    const warnings: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args) }
    try {
      const parsed = parseEmbeddedSignupMessage({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_SOMETHING_NEW",
        data: { phoneNumberId: "99", unexpected: true },
      })
      assert.equal(parsed.kind, "unknown")
      if (parsed.kind !== "unknown") return
      assert.equal(parsed.phoneNumberId, "99")
      assert.equal(logUnknownEmbeddedSignupOnce(parsed.shape), true)
      assert.equal(logUnknownEmbeddedSignupOnce(parsed.shape), false)
      assert.equal(warnings.length, 1)
      assert.match(String(warnings[0][1]), /FINISH_SOMETHING_NEW/)
    } finally {
      console.warn = original
      resetEmbeddedSignupShapeLog()
    }
  })

  it("registers a number that is not on Cloud API, reuses the sealed PIN, and skips when already registered", async () => {
    const previousSecret = process.env.BYOK_ENCRYPTION_SECRET
    process.env.BYOK_ENCRYPTION_SECRET = "phase4-whatsapp-pin-secret"
    try {
      const unregistered = { status: "PENDING", platformType: "NOT_APPLICABLE" }
      assert.equal(isPhoneNumberRegistered(unregistered), false)
      assert.equal(isPhoneNumberRegistered({ status: "CONNECTED", platformType: "CLOUD_API" }), true)

      const first = preparePhoneRegistration(unregistered, null, () => 42)
      assert.equal(first.action, "register")
      assert.equal(first.pin, "000042")
      assert.equal(first.reused, false)
      const cipher = registrationPinCipherToStore(first, "registered")
      assert.equal(cipher?.startsWith("enc:v1:"), true)
      assert.equal(openAccessToken(cipher), "000042")
      assert.equal(metadataWithoutRegistrationPin({ registration_pin: cipher, name: "Shop" })?.registration_pin, undefined)

      const again = preparePhoneRegistration(unregistered, { registration_pin: cipher }, () => 1)
      assert.equal(again.action, "register")
      assert.equal(again.pin, "000042")
      assert.equal(again.reused, true)

      const skip = preparePhoneRegistration({ status: "CONNECTED", platformType: "CLOUD_API" }, { registration_pin: cipher })
      assert.equal(skip.action, "skip")
      assert.equal(skip.pin, "000042")
      assert.equal(openAccessToken(registrationPinCipherToStore(skip, "skipped")), "000042")

      const { fetchImpl, calls } = captureFetch(async (url: any) => {
        if (url.includes("/phone-1/register")) return { json: { success: true } }
        if (url.includes("/phone-1?")) {
          return { json: { id: "phone-1", display_phone_number: "+20 100", status: "PENDING", platform_type: "NOT_APPLICABLE" } }
        }
        return { json: {} }
      })
      const loaded = await fetchPhoneNumber("phone-1", "token", fetchImpl)
      assert.equal(loaded?.status, "PENDING")
      assert.equal(loaded?.platformType, "NOT_APPLICABLE")
      assert.match(calls[0].url, /fields=.*status/)
      assert.match(calls[0].url, /platform_type/)

      const registered = await registerPhoneNumber("phone-1", "token", "000042", fetchImpl)
      assert.equal(registered.ok, true)
      const body = JSON.parse(calls[1].init.body)
      assert.deepEqual(body, { messaging_product: "whatsapp", pin: "000042" })
      assert.equal(calls[1].init.headers.Authorization, "Bearer token")

      const already = await registerPhoneNumber("phone-1", "token", "000099", async () => jsonResponse({
        error: { message: "(#100) Phone number already registered", code: 100 },
      }, false, 400))
      assert.equal(already.ok, true)
      if (already.ok) assert.equal(already.alreadyRegistered, true)
      const fresh = preparePhoneRegistration(unregistered, null, () => 7)
      assert.equal(registrationPinCipherToStore(fresh, "already-registered"), null)

      const mismatch = registrationFailureMessage({ error: { code: 133005, message: "PIN mismatch" } })
      assert.match(mismatch, /two-step verification PIN/)
    } finally {
      if (previousSecret === undefined) delete process.env.BYOK_ENCRYPTION_SECRET
      else process.env.BYOK_ENCRYPTION_SECRET = previousSecret
    }
  })

  it("deregisters and unsubscribes on disconnect without throwing when Meta refuses", async () => {
    assert.equal(wabaIdFromConnection({ page_id: "phone-1", external_account_id: "phone-1", metadata: { waba_id: "waba-1" } }), "waba-1")
    assert.equal(wabaIdFromConnection({ page_id: "phone-1", external_account_id: "phone-1" }), null)
    assert.equal(shouldUnsubscribeWaba(["waba-1"], "waba-1"), false)
    assert.equal(shouldUnsubscribeWaba(["waba-2"], "waba-1"), true)
    assert.equal(shouldUnsubscribeWaba([], null), false)

    const { fetchImpl, calls } = captureFetch(async (url: any, init: any) => {
      if (String(init?.method) === "DELETE") return { json: { success: true } }
      if (url.endsWith("/deregister")) return { ok: false, status: 400, json: { error: { message: "rate limited", code: 133016 } } }
      return { json: { success: true } }
    })
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    try {
      await releaseWhatsAppConnection({
        accessToken: "token",
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        unsubscribe: true,
      }, fetchImpl)
    } finally {
      console.error = original
    }
    assert.equal(calls[0].init.method, "DELETE")
    assert.match(calls[0].url, /\/waba-1\/subscribed_apps$/)
    assert.match(calls[1].url, /\/phone-1\/deregister$/)
    assert.equal(calls[1].init.method, "POST")
    assert.equal(errors.length, 1)

    const removed = await unsubscribeWaba("waba-9", "token", fetchImpl)
    assert.equal(removed, true)
    const deregistered = await deregisterPhoneNumber("phone-9", "token", async () => jsonResponse({ success: true }))
    assert.equal(deregistered.ok, true)
  })
})

