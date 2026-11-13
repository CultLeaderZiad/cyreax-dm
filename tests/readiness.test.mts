import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"

const { postJson, isThrottled } = await import("../lib/channels/http.ts")
const { classifyGraphResponse, probeUrl } = await import("../lib/meta/token-health.ts")
const { subscribeInstagramAccount, IG_SUBSCRIBED_FIELDS, FB_PAGE_SUBSCRIBED_FIELDS } = await import("../lib/meta/subscriptions.ts")
const { shortLivedTokenError } = await import("../lib/whatsapp/connect.ts")
const { applyMetaCallback } = await import("../lib/meta/deletion.ts")

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("Graph send retries", () => {
  it("retries throttled sends, then succeeds", async () => {
    const replies = [jsonResponse(400, { error: { code: 613 } }), jsonResponse(200, { message_id: "m1" })]
    let calls = 0
    const out = await postJson(async () => { calls++; return replies.shift()! }, "https://x", {}, {}, { wait: async () => {} })
    assert.equal(calls, 2)
    assert.equal(out.ok, true)
  })

  it("never retries a non-throttle error (no double sends)", async () => {
    let calls = 0
    const out = await postJson(async () => { calls++; return jsonResponse(500, { error: { code: 2 } }) }, "https://x", {}, {}, { wait: async () => {} })
    assert.equal(calls, 1)
    assert.equal(out.ok, false)
  })

  it("gives up after the retry budget", async () => {
    let calls = 0
    await postJson(async () => { calls++; return jsonResponse(429, {}) }, "https://x", {}, {}, { wait: async () => {} })
    assert.equal(calls, 3)
  })

  it("classifies throttle codes", () => {
    assert.equal(isThrottled(429, null), true)
    assert.equal(isThrottled(400, { error: { code: 130429 } }), true)
    assert.equal(isThrottled(400, { error: { code: 131047 } }), false)
  })
})

describe("Meta token health", () => {
  it("only a definite dead-token code flips the flag", () => {
    assert.equal(classifyGraphResponse(200, { id: "1" }), "ok")
    assert.equal(classifyGraphResponse(400, { error: { code: 190 } }), "dead")
    assert.equal(classifyGraphResponse(400, { error: { code: 4 } }), "unknown")
    assert.equal(classifyGraphResponse(500, null), "unknown")
  })

  it("probes the right endpoint per platform", () => {
    assert.match(probeUrl("facebook", "1")!, /graph\.facebook\.com\/v[\d.]+\/me/)
    assert.match(probeUrl("instagram", "1")!, /graph\.instagram\.com/)
    assert.match(probeUrl("whatsapp", "555")!, /\/555\?fields=id/)
    assert.equal(probeUrl("telegram", "1"), null)
  })
})

describe("Meta webhook subscriptions", () => {
  it("subscribes Instagram accounts to messages and comments", async () => {
    let seen = ""
    let method = ""
    const ok = await subscribeInstagramAccount("tok", (async (url: string, init: RequestInit) => {
      seen = url
      method = String(init?.method)
      return jsonResponse(200, { success: true })
    }) as typeof fetch)
    assert.equal(ok, true)
    assert.equal(method, "POST")
    assert.match(seen, /graph\.instagram\.com\/v[\d.]+\/me\/subscribed_apps/)
    for (const field of ["messages", "comments", "messaging_postbacks"]) assert.ok(IG_SUBSCRIBED_FIELDS.includes(field))
  })

  it("reports failure instead of claiming success", async () => {
    const ok = await subscribeInstagramAccount("tok", (async () => jsonResponse(400, { error: { code: 100 } })) as typeof fetch)
    assert.equal(ok, false)
  })

  it("Facebook pages get reactions and echoes too", () => {
    for (const field of ["messages", "message_reactions", "message_echoes", "feed"]) assert.ok(FB_PAGE_SUBSCRIBED_FIELDS.includes(field))
  })

  it("the Instagram callback no longer hardcodes webhook_subscribed: true", () => {
    const src = readFileSync("app/api/instagram/callback/route.ts", "utf8")
    assert.ok(!src.includes("webhook_subscribed: true"))
    assert.ok(src.includes("subscribeInstagramAccount("))
  })
})

describe("WhatsApp manual tokens", () => {
  it("rejects temporary tokens and accepts permanent ones", async () => {
    process.env.FACEBOOK_APP_ID = "app"
    process.env.META_APP_SECRET = "secret"
    const now = 1_800_000_000
    const temp = await shortLivedTokenError("t", (async () => jsonResponse(200, { data: { is_valid: true, expires_at: now + 3600 } })) as any, now)
    assert.match(temp || "", /temporary/)
    const permanent = await shortLivedTokenError("t", (async () => jsonResponse(200, { data: { is_valid: true, expires_at: 0 } })) as any, now)
    assert.equal(permanent, null)
    const invalid = await shortLivedTokenError("t", (async () => jsonResponse(200, { data: { is_valid: false } })) as any, now)
    assert.match(invalid || "", /invalid/)
  })
})

describe("Meta deauthorize", () => {
  it("revokes connection tokens without writing a column that does not exist", async () => {
    const updates: Array<{ table: string; values: any }> = []
    const chain = (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        delete: () => q,
        update: (values: any) => { updates.push({ table, values }); return q },
        then: (resolve: any) => resolve({
          data: table === "platform_connections" ? [{ id: "c1", metadata: { name: "Page" } }] : [],
          error: null,
        }),
      }
      return q
    }
    await applyMetaCallback({ from: chain }, "123", "deauthorize")
    const conn = updates.find((u) => u.table === "platform_connections")
    assert.ok(conn, "connection was updated")
    assert.ok(!("reconnect_required" in conn!.values), "no reconnect_required column on platform_connections")
    assert.equal(conn!.values.metadata.reconnect_required, true)
    assert.equal(conn!.values.metadata.name, "Page")
  })
})

describe("No placeholder data", () => {
  it("overview and automations show only real data", () => {
    const overview = readFileSync("app/dashboard/page.tsx", "utf8")
    for (const fake of ["1284", "318", '"71.4"', '"38s"', "592", "DEFAULT_ACTIVITY_EVENTS"]) {
      assert.ok(!overview.includes(fake), `overview still contains ${fake}`)
    }
    const automations = readFileSync("app/dashboard/automations/page.tsx", "utf8")
    assert.ok(!automations.includes('id: "demo-'), "automations still has sample rules")
    for (const f of ["components/mobile/PlanCard.tsx", "components/mobile/MobileDrawer.tsx"]) {
      const src = readFileSync(f, "utf8")
      for (const fake of ["8240", "1912", "Renews 12 Nov", "1,450"]) assert.ok(!src.includes(fake), `${f} contains ${fake}`)
    }
  })
})

describe("Sidebar", () => {
  it("a parent without its own page only toggles (Admin used to open and close in one click)", () => {
    const src = readFileSync("components/nav/SidebarTree.tsx", "utf8")
    const handler = src.slice(src.indexOf("const handleParentClick"), src.indexOf("// Keyboard navigation"))
    assert.match(handler, /if \(!item\.href\) \{\s*toggleExpand\(item\.id\)\s*return/)
    assert.ok(src.includes("useMemo(() => filterNavByRole(NAV, userRole)"), "nav items are memoised")
  })
})
