import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"

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
