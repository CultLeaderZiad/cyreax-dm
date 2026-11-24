/**
 * Admin -> Settings -> Announcements: the top bar and the home-page updates
 * block are separate switches, only an admin can change them, and the updates
 * block is hidden unless the admin turned it on.
 */
import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

const { fakeDb } = await import("./fakes/supabase-server.ts")
const { NextRequest } = await import("next/server")
const adminRoute = await import("../app/api/admin/settings/banner/route.ts")
const publicRoute = await import("../app/api/settings/banner/route.ts")

const ADMIN = "aaaaaaaa-0000-0000-0000-00000000000a"
const USER = "bbbbbbbb-0000-0000-0000-00000000000b"

function seed(value: Record<string, unknown> | null) {
  const db = fakeDb()
  db.emailConfirmed = true
  db.rpc = {}
  db.authUserId = ADMIN
  db.tables = {
    accounts: [
      { id: ADMIN, email: "admin@test.local", role: "admin", plan: "monthly", active_workspace_id: "wA" },
      { id: USER, email: "user@test.local", role: "customer", plan: "monthly", active_workspace_id: "wB" },
    ],
    workspaces: [{ id: "wA", name: "A", owner_account_id: ADMIN, created_at: "2026-01-01" }, { id: "wB", name: "B", owner_account_id: USER, created_at: "2026-01-01" }],
    workspace_members: [{ workspace_id: "wA", account_id: ADMIN, role: "owner", created_at: "2026-01-01" }, { workspace_id: "wB", account_id: USER, role: "owner", created_at: "2026-01-01" }],
    users: [{ id: 1, account_id: ADMIN, workspace_id: "wA" }, { id: 2, account_id: USER, workspace_id: "wB" }],
    app_settings: value ? [{ key: "update_banner", value }] : [],
  }
}
const patch = (body: unknown) => adminRoute.PATCH(new NextRequest("https://app.test/api/admin/settings/banner", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }))
const stored = () => fakeDb().tables.app_settings.find((r: any) => r.key === "update_banner")?.value

describe("announcements", () => {
  beforeEach(() => seed(null))

  it("the home-page updates block is off unless the admin turned it on", async () => {
    seed({ isActive: true, message: "hi", link: "", content: "# Old news", type: "standard" })
    assert.equal((await (await publicRoute.GET()).json()).showUpdates, false)
    seed({ isActive: false, message: "", link: "", content: "# News", showUpdates: true })
    assert.equal((await (await publicRoute.GET()).json()).showUpdates, true)
  })

  it("the two switches are independent", async () => {
    assert.equal((await patch({ isActive: true, message: "Bar", showUpdates: false, content: "x" })).status, 200)
    assert.deepEqual([stored().isActive, stored().showUpdates], [true, false])
    assert.equal((await patch({ isActive: false, message: "Bar", showUpdates: true, content: "x" })).status, 200)
    assert.deepEqual([stored().isActive, stored().showUpdates], [false, true])
  })

  it("an older caller that does not send showUpdates does not switch it off or on", async () => {
    seed({ isActive: true, message: "a", link: "", content: "x", showUpdates: true })
    await patch({ isActive: true, message: "b" })
    assert.equal(stored().showUpdates, true)
    assert.equal(stored().message, "b")
  })

  it("customers cannot change announcements", async () => {
    fakeDb().authUserId = USER
    assert.equal((await patch({ isActive: true, message: "hack" })).status, 403)
    assert.equal(stored(), undefined)
  })
})
