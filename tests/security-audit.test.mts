import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync, readdirSync } from "node:fs"

const { safeAuthNext } = await import("../lib/auth-redirect.ts")
const { resolveVerifiedPageToken } = await import("../lib/meta/page-connect.ts")

type Route = (url: URL) => { status: number; body: unknown }

function fakeGraph(route: Route) {
  const calls: string[] = []
  const fetchImpl = async (input: string) => {
    const url = new URL(input)
    calls.push(url.pathname)
    const { status, body } = route(url)
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }
  return { fetchImpl, calls }
}

describe("facebook page connect requires proof of page control", () => {
  it("accepts a page listed in the caller's /me/accounts", async () => {
    const graph = fakeGraph((url) =>
      url.pathname.endsWith("/me/accounts")
        ? { status: 200, body: { data: [{ id: "111", name: "Mine", category: "Shop", access_token: "PAGE_TOKEN_111" }] } }
        : { status: 400, body: { error: { message: "nope" } } },
    )
    const result = await resolveVerifiedPageToken({ pageId: "111", userAccessToken: "USER", fetchImpl: graph.fetchImpl })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.pageAccessToken, "PAGE_TOKEN_111")
  })

  it("rejects another tenant's page id when Graph returns no page token", async () => {
    // Attacker's own token: /me/accounts lists only their page, direct lookup of
    // the victim page returns public fields without access_token.
    const graph = fakeGraph((url) =>
      url.pathname.endsWith("/me/accounts")
        ? { status: 200, body: { data: [{ id: "111", access_token: "PAGE_TOKEN_111" }] } }
        : { status: 200, body: { id: "999", name: "Victim Page" } },
    )
    const result = await resolveVerifiedPageToken({ pageId: "999", userAccessToken: "ATTACKER", fetchImpl: graph.fetchImpl })
    assert.deepEqual(result, { ok: false, error: "not_page_admin" })
  })

  it("rejects when Graph errors instead of falling back to the user token", async () => {
    const graph = fakeGraph(() => ({ status: 400, body: { error: { message: "Unsupported get request" } } }))
    const result = await resolveVerifiedPageToken({ pageId: "999", userAccessToken: "USER", fetchImpl: graph.fetchImpl })
    assert.equal(result.ok, false)
  })

  it("refuses without a server-held user token and never calls Graph", async () => {
    const graph = fakeGraph(() => ({ status: 200, body: {} }))
    const result = await resolveVerifiedPageToken({ pageId: "999", userAccessToken: "", fetchImpl: graph.fetchImpl })
    assert.deepEqual(result, { ok: false, error: "no_user_token" })
    assert.equal(graph.calls.length, 0)
  })

  it("rejects non-numeric page ids (no path injection into Graph URLs)", async () => {
    const graph = fakeGraph(() => ({ status: 200, body: { access_token: "x" } }))
    const result = await resolveVerifiedPageToken({ pageId: "me/accounts", userAccessToken: "USER", fetchImpl: graph.fetchImpl })
    assert.equal(result.ok, false)
    assert.equal(graph.calls.length, 0)
  })
})

const { maskSmtpSettings, mergeSmtpUpdate, openSmtpPassword } = await import("../lib/smtp-settings.ts")

describe("smtp settings never expose the password", () => {
  const seal = (plain: string) => `sealed(${plain})`

  it("masks plaintext and sealed passwords for the admin UI", () => {
    assert.equal(maskSmtpSettings({ host: "h", pass: "plain" }).pass, "")
    assert.equal(maskSmtpSettings({ host: "h", pass: "plain" }).hasPassword, true)
    const sealed = maskSmtpSettings({ host: "h", pass_encrypted: "x" }) as Record<string, unknown>
    assert.equal(sealed.pass_encrypted, undefined)
    assert.equal(sealed.hasPassword, true)
  })

  it("seals a new password and never stores plaintext", () => {
    const row = mergeSmtpUpdate(null, { host: "smtp.example.com", port: 465, user: "u", pass: "s3cret" }, seal)
    assert.equal(row.pass, undefined)
    assert.equal(row.pass_encrypted, "sealed(s3cret)")
  })

  it("keeps the existing password when the masked form is saved", () => {
    const row = mergeSmtpUpdate({ pass_encrypted: "old" }, { host: "h", pass: "" }, seal)
    assert.equal(row.pass_encrypted, "old")
    const legacy = mergeSmtpUpdate({ pass: "legacy" }, { host: "h" }, seal)
    assert.equal(legacy.pass_encrypted, "sealed(legacy)")
    assert.equal(legacy.pass, undefined)
  })

  it("still reads legacy plaintext rows so mail keeps working", () => {
    assert.equal(openSmtpPassword({ pass: "legacy" }), "legacy")
    assert.equal(openSmtpPassword(null), null)
  })
})

describe("every auth redirect route validates next", () => {
  for (const file of ["app/auth/callback/route.ts", "app/auth/confirm/route.ts", "app/api/auth/callback/route.ts"]) {
    it(`${file} passes next through safeAuthNext`, () => {
      const source = readFileSync(file, "utf8")
      assert.match(source, /safeAuthNext\(searchParams\.get\(['"]next['"]\)/)
      assert.doesNotMatch(source, /searchParams\.get\(['"]next['"]\)\s*\?\?/)
    })
  }
  it("rejects userinfo / host-suffix payloads that `${origin}${next}` would turn into another host", () => {
    for (const payload of ["@evil.com", ".evil.com", "evil.com", "//evil.com", "/\\evil.com", "/%5Cevil.com", "https:evil.com"]) {
      const next = safeAuthNext(payload, "/dashboard", "https://cyreax-dm.vercel.app")
      assert.equal(new URL(`https://cyreax-dm.vercel.app${next}`).host, "cyreax-dm.vercel.app", payload)
    }
  })
})

describe("facebook oauth is bound to the browser that started it", () => {
  it("auth route sets a state cookie and sends state to Facebook", () => {
    const source = readFileSync("app/api/facebook/auth/route.ts", "utf8")
    assert.match(source, /createOAuthState\(\)/)
    assert.equal((source.match(/&state=\$\{state\}/g) || []).length, 2)
    assert.match(source, /cookies\.set\(FB_OAUTH_STATE_COOKIE/)
  })
  it("callback rejects a missing or mismatched state before exchanging the code", () => {
    const source = readFileSync("app/api/facebook/callback/route.ts", "utf8")
    const stateCheck = source.indexOf("safeEqual(state, expectedState)")
    const exchange = source.indexOf("oauth/access_token")
    assert.ok(stateCheck > 0 && exchange > stateCheck)
    assert.doesNotMatch(source, /JSON\.stringify\(allParams\)/)
  })
})

const { metaVerifyTokenMatches } = await import("../lib/webhooks/verify-token.ts")

describe("meta webhook verify token", () => {
  it("accepts only an exact configured token", () => {
    const env = { FACEBOOK_WEBHOOK_VERIFY_TOKEN: "Configured-Token-123" }
    assert.equal(metaVerifyTokenMatches("Configured-Token-123", env), true)
    assert.equal(metaVerifyTokenMatches("configured-token-123", env), false)
    assert.equal(metaVerifyTokenMatches("Configured-Token-12", env), false)
    assert.equal(metaVerifyTokenMatches(null, env), false)
  })
  it("has no built-in fallback tokens and fails closed when none is configured", () => {
    for (const leaked of ["GlymL4xsz3vkDEZ0FwS6XHpN2aUTICJ1", "cyreax_dm_verify_2026", "cyreax_verify_token"]) {
      assert.equal(metaVerifyTokenMatches(leaked, {}), false)
    }
    for (const file of ["app/api/instagram/webhook/route.ts", "app/api/facebook/webhook/route.ts", "app/api/whatsapp/webhook/route.ts"]) {
      const source = readFileSync(file, "utf8")
      assert.doesNotMatch(source, /cyreax_dm_verify_2026|cyreax_verify_token|GlymL4/, file)
      assert.doesNotMatch(source, /toLowerCase\(\) === candidate/, file)
    }
  })
})

const { splitInboundEvents } = await import("../lib/event-pipeline.ts")
const { enqueueInboundEvents } = await import("../lib/inbound-queue.ts")

function fakeQueueDb() {
  const keys = new Set<string>()
  return {
    keys,
    from() {
      return {
        async insert(row: { idempotency_key: string }) {
          if (keys.has(row.idempotency_key)) return { error: { code: "23505", message: "duplicate key" } }
          keys.add(row.idempotency_key)
          return { error: null }
        },
      }
    },
  }
}

describe("webhook replay produces exactly one queued event", () => {
  const delivery = {
    object: "instagram",
    entry: [{ id: "1784", time: 1, messaging: [{ sender: { id: "u1" }, recipient: { id: "1784" }, message: { mid: "m_1", text: "price?" } }] }],
  }
  it("the same Meta delivery twice is one event and one duplicate", async () => {
    const db = fakeQueueDb()
    const first = await enqueueInboundEvents(db, splitInboundEvents("instagram", delivery))
    const second = await enqueueInboundEvents(db, splitInboundEvents("instagram", structuredClone(delivery)))
    assert.deepEqual(first, { accepted: 1, duplicates: 0 })
    assert.deepEqual(second, { accepted: 0, duplicates: 1 })
    assert.equal(db.keys.size, 1)
  })
  it("a WhatsApp message id retried in a new envelope is still one event", async () => {
    const wa = (time: number) => ({
      object: "whatsapp_business_account",
      entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "p1" }, messages: [{ id: "wamid.X", timestamp: String(time), text: { body: "hi" } }] } }] }],
    })
    const db = fakeQueueDb()
    await enqueueInboundEvents(db, splitInboundEvents("whatsapp", wa(1)))
    const again = await enqueueInboundEvents(db, splitInboundEvents("whatsapp", wa(1)))
    assert.equal(again.accepted, 0)
    assert.equal(db.keys.size, 1)
  })
})

const { createHmac } = await import("node:crypto")
const { NextRequest } = await import("next/server")

function signedRequest(url: string, body: string, secret: string | null, header = "x-hub-signature-256") {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (secret !== null) headers[header] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  return new NextRequest(url, { method: "POST", body, headers })
}

describe("webhook routes reject unsigned and forged deliveries", () => {
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "1", messaging: [{ message: { mid: "m", text: "hi" } }] }] })

  it("instagram, facebook and whatsapp: forged signature is 401", async () => {
    process.env.INSTAGRAM_APP_SECRET = "real-secret"
    process.env.FACEBOOK_APP_SECRET = "real-secret"
    process.env.META_APP_SECRET = "real-secret"
    const routes = [
      ["app/api/instagram/webhook/route.ts", "https://x.test/api/instagram/webhook"],
      ["app/api/facebook/webhook/route.ts", "https://x.test/api/facebook/webhook"],
      ["app/api/whatsapp/webhook/route.ts", "https://x.test/api/whatsapp/webhook"],
    ] as const
    for (const [file, url] of routes) {
      const mod = await import(`../${file}?forged`)
      const forged = await mod.POST(signedRequest(url, body, "attacker-guess"))
      assert.equal(forged.status, 401, file)
      const unsigned = await mod.POST(signedRequest(url, body, null))
      assert.equal(unsigned.status, 401, file)
    }
  })

  it("fails closed when the app secret is missing (no empty-key HMAC accepted)", async () => {
    delete process.env.INSTAGRAM_APP_SECRET
    delete process.env.META_APP_SECRET
    delete process.env.FACEBOOK_APP_SECRET
    for (const file of ["app/api/instagram/webhook/route.ts", "app/api/whatsapp/webhook/route.ts", "app/api/facebook/webhook/route.ts"]) {
      const mod = await import(`../${file}?nosecret`)
      const res = await mod.POST(signedRequest("https://x.test/hook", body, ""))
      assert.equal(res.status, 401, file)
    }
  })

  it("tiktok: forged signature is 401", async () => {
    process.env.TIKTOK_APP_SECRET = "tt-secret"
    const mod = await import("../app/api/tiktok/webhook/route.ts")
    const req = new NextRequest("https://x.test/api/tiktok/webhook", {
      method: "POST",
      body: "{}",
      headers: { "tiktok-signature": `t=${Math.floor(Date.now() / 1000)},s=deadbeef` },
    })
    assert.equal((await mod.POST(req)).status, 401)
  })
})

const { unauthorizedCronResponse } = await import("../lib/cron-auth.ts")

describe("cron routes require CRON_SECRET", () => {
  const cron = (auth?: string) =>
    new NextRequest("https://x.test/api/cron/process-inbound-events", { headers: auth ? { authorization: auth } : {} })

  it("missing CRON_SECRET fails closed (503) even with a header", () => {
    delete process.env.CRON_SECRET
    assert.equal(unauthorizedCronResponse(cron("Bearer "))?.status, 503)
    assert.equal(unauthorizedCronResponse(cron("Bearer undefined"))?.status, 503)
  })
  it("no or wrong bearer is 401; the right one passes", () => {
    process.env.CRON_SECRET = "cron-secret-value"
    assert.equal(unauthorizedCronResponse(cron())?.status, 401)
    assert.equal(unauthorizedCronResponse(cron("Bearer wrong"))?.status, 401)
    assert.equal(unauthorizedCronResponse(cron("cron-secret-value"))?.status, 401)
    assert.equal(unauthorizedCronResponse(cron("Bearer cron-secret-value")), null)
  })
  it("every cron route calls the guard before doing work", () => {
    for (const dir of readdirSync("app/api/cron")) {
      const source = readFileSync(`app/api/cron/${dir}/route.ts`, "utf8")
      assert.match(source, /unauthorizedCronResponse\(request\)/, dir)
    }
  })
})

const { takeRateSlots, escapeHtml, llmRateRules } = await import("../lib/rate-limit.ts")

/** Same semantics as public.take_inbound_rate_slot: fixed window per key. */
function fakeRateDb(now = () => Date.now()) {
  const buckets = new Map<string, { start: number; count: number }>()
  return {
    buckets,
    async rpc(_fn: string, args: Record<string, unknown>) {
      const key = String(args.p_account_key)
      const limit = Number(args.p_limit)
      const windowMs = Number(args.p_window_seconds) * 1000
      const bucket = buckets.get(key) || { start: now(), count: 0 }
      if (bucket.start < now() - windowMs) Object.assign(bucket, { start: now(), count: 0 })
      buckets.set(key, bucket)
      if (bucket.count >= limit) return { data: false, error: null }
      bucket.count += 1
      return { data: true, error: null }
    },
  }
}

describe("abuse and cost limits", () => {
  it("a retry storm of 500 LLM calls from one account gets at most the per-minute budget", async () => {
    const db = fakeRateDb()
    let allowed = 0
    for (let i = 0; i < 500; i++) if (await takeRateSlots(db, llmRateRules("123", "acct-a", {}))) allowed += 1
    assert.equal(allowed, 30)
  })

  it("many accounts together stop at the global ceiling", async () => {
    const db = fakeRateDb()
    let allowed = 0
    for (let a = 0; a < 100; a++) {
      for (let i = 0; i < 30; i++) if (await takeRateSlots(db, llmRateRules(String(a), `acct-${a}`, {}))) allowed += 1
    }
    assert.equal(allowed, 600)
  })

  it("fails closed when the rate store errors", async () => {
    const broken = { rpc: async () => ({ data: null, error: { message: "connection reset" } }) }
    assert.equal(await takeRateSlots(broken, [{ key: "abuse:x", limit: 5, windowSeconds: 60 }]), false)
    assert.equal(await takeRateSlots(broken, [{ key: "abuse:x", limit: 5, windowSeconds: 60 }], { failOpen: true }), true)
  })

  it("newsletter route rate-limits by IP, per address, globally, and escapes the name", () => {
    const source = readFileSync("app/api/newsletter/subscribe/route.ts", "utf8")
    assert.match(source, /abuse:newsletter:ip:/)
    assert.match(source, /abuse:newsletter:to:/)
    assert.match(source, /abuse:newsletter:global/)
    assert.match(source, /escapeHtml\(normalizedName\)/)
    assert.equal(escapeHtml(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;")
  })

  it("generateCompletion checks the burst limit before calling any provider", () => {
    const source = readFileSync("lib/llm-provider.ts", "utf8")
    const fn = source.slice(source.indexOf("export async function generateCompletion("))
    assert.ok(fn.indexOf("takeRateSlots(") > 0 && fn.indexOf("takeRateSlots(") < fn.indexOf("callGroqAPI("))
  })
})

const { fetchShopifyProducts, fetchWooProducts } = await import("../lib/commerce/sync.ts")

describe("catalog sync refuses internal or plaintext store URLs (SSRF)", () => {
  const never = async () => {
    throw new Error("fetch must not be called")
  }
  for (const shop of ["localhost", "127.0.0.1", "169.254.169.254", "10.0.0.5", "shop.internal", "evil.com/../x", "a.com:8080", "user:pw@a.com"]) {
    it(`shopify rejects ${shop}`, async () => {
      await assert.rejects(fetchShopifyProducts(shop, "t", never as any), /public https hostname/)
    })
  }
  for (const site of ["http://shop.example.com", "https://127.0.0.1", "https://localhost", "https://192.168.1.10/wp"]) {
    it(`woocommerce rejects ${site}`, async () => {
      await assert.rejects(fetchWooProducts(site, "k", "s", never as any), /https URL on a public host/)
    })
  }
  it("still allows a normal store", async () => {
    let called = ""
    const ok = async (url: string) => {
      called = url
      return new Response(JSON.stringify({ products: [] }), { status: 200 })
    }
    await fetchShopifyProducts("my-store.myshopify.com", "t", ok as any)
    assert.match(called, /^https:\/\/my-store\.myshopify\.com\/admin\/api\//)
  })
})

const { isPrivateAddress, resolvesToPublicHost } = await import("../lib/net/public-host.ts")
const { importWebsite } = await import("../lib/ai-agent/ingest.ts")
const { deliverWebhook } = await import("../lib/integrations/dispatch.ts")

describe("outbound fetches resolve DNS before connecting (SSRF)", () => {
  const resolvingTo = (address: string) => async () => [{ address }]
  it("classifies private and public addresses", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.0.9", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      assert.equal(isPrivateAddress(ip), true, ip)
    }
    for (const ip of ["8.8.8.8", "104.16.0.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip)
  })
  it("refuses a public-looking name that resolves to a private address", async () => {
    assert.equal(await resolvesToPublicHost("https://rebind.example.com/x", resolvingTo("10.0.0.5")), false)
    assert.equal(await resolvesToPublicHost("https://ok.example.com/x", resolvingTo("93.184.216.34")), true)
    assert.equal(await resolvesToPublicHost("https://err.example.com/x", async () => { throw new Error("NXDOMAIN") }), false)
  })
  it("URL import and outgoing webhooks never fetch a private target", async () => {
    let fetched = 0
    const fetchSpy = (async () => { fetched += 1; return new Response("x") }) as any
    const imported = await importWebsite("https://rebind.example.com/", fetchSpy, async () => false)
    assert.ok("error" in imported)
    const sent = await deliverWebhook({ url: "https://rebind.example.com/", secret: "s", body: "{}", nowMs: 0, fetchImpl: fetchSpy, checkHost: async () => false })
    assert.deepEqual(sent, { ok: false, status: 0 })
    assert.equal(fetched, 0)
  })
})
