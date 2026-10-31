import assert from "node:assert/strict"
import { describe, it } from "node:test"

const { PLAN_CATALOG, resolvePlan, planPriceCents, meterPeriod } = await import("../lib/billing/plans.ts")
const { judgeUsage, channelSlots, slotsAfterConnect } = await import("../lib/billing/usage.ts")
const { normalizeClientPrice, invoiceForPrice, majorAmount } = await import("../lib/billing/reseller.ts")
const { classifyChange, schedulePlanChange, startTrial, dunningAction } = await import("../lib/billing/lifecycle.ts")
const { assertWithinLimit, assertFeature, incrementMeter, PlanLimitError, measureUsage } = await import("../lib/billing/enforce.ts")
const { signMetaRequest, parseSignedRequest, deletionCallbackBody } = await import("../lib/meta/signed-request.ts")
const { handleMetaDataDeletion, applyMetaCallback } = await import("../lib/meta/deletion.ts")
const { shapeForPdf } = await import("../lib/pdf/arabic.ts")
const { botText, publicReplies, followSubtitle } = await import("../lib/bot-copy.ts")
const { renderReportPdf } = await import("../lib/agency/reports.ts")

function chain(rows: any[]) {
  const filters: Array<(row: any) => boolean> = []
  let counting = false
  const api: any = {
    select(_columns: string, options?: { count?: string }) {
      counting = Boolean(options?.count)
      return api
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value)
      return api
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]))
      return api
    },
    gte() {
      return api
    },
    maybeSingle() {
      const found = rows.filter((row) => filters.every((filter) => filter(row)))
      return Promise.resolve({ data: found[0] || null, error: null })
    },
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      const found = rows.filter((row) => filters.every((filter) => filter(row)))
      return Promise.resolve({ data: counting ? null : found, error: null, count: found.length }).then(resolve, reject)
    },
  }
  return api
}

function db(tables: Record<string, any[]>, rpc?: (name: string, args: any) => any) {
  const writes: any[] = []
  return {
    writes,
    from(table: string) {
      const query = chain(tables[table] || [])
      const original = query
      return {
        select: (...args: any[]) => original.select(...args),
        update(values: any) {
          writes.push({ table, op: "update", values })
          return chain(tables[table] || [])
        },
        delete() {
          writes.push({ table, op: "delete" })
          return chain(tables[table] || [])
        },
        insert(values: any) {
          writes.push({ table, op: "insert", values })
          return chain([])
        },
        upsert(values: any) {
          writes.push({ table, op: "upsert", values })
          return { error: null }
        },
      }
    },
    rpc(name: string, args: any) {
      return Promise.resolve(rpc ? rpc(name, args) : { data: null, error: { message: "missing" } })
    },
  }
}

describe("plan catalog", () => {
  it("resolves creator and agency tiers, including legacy slugs", () => {
    assert.equal(resolvePlan("monthly").id, "creator")
    assert.equal(resolvePlan("trial").id, "creator")
    assert.equal(resolvePlan("one_time").id, "creator_plus")
    assert.equal(resolvePlan("free").id, "creator_free")
    assert.equal(resolvePlan("agency").limits.whiteLabel, true)
    assert.equal(resolvePlan("agency_pro").limits.channels, -1)
    assert.equal(resolvePlan("expired").blocked, true)
    assert.equal(resolvePlan("expired").id, "expired")
    assert.equal(planPriceCents("creator", "year"), 29000)
    assert.equal(PLAN_CATALOG.length, 5)
    assert.equal(meterPeriod("aiReplies", new Date("2026-09-03T00:00:00Z")), "2026-09")
    assert.equal(meterPeriod("contacts", new Date("2026-09-03T00:00:00Z")), "lifetime")
  })
})

describe("limit enforcement and metering", () => {
  it("warns at 80 percent, blocks past the limit, and leaves unlimited plans open", () => {
    const soft = judgeUsage({ metric: "contacts", used: 400, limit: 500, adding: 0 })
    assert.equal(soft.level, "soft")
    assert.equal(soft.allowed, true)
    assert.match(soft.message, /80%/)

    const hard = judgeUsage({ metric: "contacts", used: 500, limit: 500, adding: 1 })
    assert.equal(hard.level, "hard")
    assert.equal(hard.allowed, false)

    const open = judgeUsage({ metric: "channels", used: 40, limit: -1, adding: 1 })
    assert.equal(open.allowed, true)
    assert.equal(open.remaining, null)

    const paused = judgeUsage({ metric: "broadcasts", used: 0, limit: 4, adding: 1, blocked: true })
    assert.equal(paused.allowed, false)
    assert.match(paused.message, /paused/)
  })

  it("counts a Facebook page and its Messenger row as one channel", () => {
    const used = channelSlots({
      connections: [
        { platform: "facebook", pageId: "page-1" },
        { platform: "messenger", pageId: "page-1" },
        { platform: "whatsapp", pageId: "wa-1" },
      ],
    })
    assert.equal(used, 2)
    const again = slotsAfterConnect(
      { connections: [{ platform: "facebook", pageId: "page-1" }] },
      { platform: "messenger", pageId: "page-1" },
    )
    assert.equal(again.adding, 0)

    const withUserProfile = channelSlots({
      connections: [
        { platform: "facebook", pageId: "page-1" },
        { platform: "messenger", pageId: "page-1" },
        { platform: "facebook", pageId: "fb-user-1", metadata: { is_user_profile: true } },
        { platform: "whatsapp", pageId: "wa-1" },
      ],
    })
    assert.equal(withUserProfile, 2)

    const userProfileAdd = slotsAfterConnect(
      { connections: [{ platform: "facebook", pageId: "page-1" }] },
      { platform: "facebook", pageId: "fb-user-1", metadata: { is_user_profile: true } },
    )
    assert.equal(userProfileAdd.adding, 0)
  })

  it("rejects a new contact past the free limit and meters an AI reply", async () => {
    const tables = {
      billing_accounts: [],
      users: [{ id: 9, account_id: "acc-1", access_token: "tok", business_account_id: "ig" }],
      contacts: Array.from({ length: 500 }, (_, index) => ({ id: index, user_id: 9 })),
      usage_meters: [],
    }
    const supabase = db(tables)
    await assert.rejects(
      () => assertWithinLimit(supabase, { id: "acc-1", plan: "creator_free" }, "contacts"),
      (error: unknown) => error instanceof PlanLimitError && error.metric === "contacts" && error.limit === 500,
    )

    const metered = db(
      { users: [{ id: 9, account_id: "acc-1" }], usage_meters: [], billing_accounts: [] },
      () => ({ data: 3, error: null }),
    )
    assert.equal(await incrementMeter(metered, "acc-1", "aiReplies", 1, new Date("2026-09-30T00:00:00Z")), 3)
    assert.equal(await measureUsage(db({ users: [{ id: 9, account_id: "acc-1" }], usage_meters: [{ account_id: "acc-1", metric: "ai_replies", period: "2026-09", used: 12 }] }), "acc-1", "aiReplies", new Date("2026-09-30T00:00:00Z")), 12)
  })

  it("keeps white-label off the creator plan", async () => {
    await assert.rejects(
      () => assertFeature(db({ billing_accounts: [] }), { id: "acc-1", plan: "creator" }, "whiteLabel"),
      (error: unknown) => error instanceof PlanLimitError && /White-label/.test((error as Error).message),
    )
  })
})

describe("reseller pricing", () => {
  it("validates a client price and formats three-decimal Gulf currencies", () => {
    const bad = normalizeClientPrice({ amountCents: 50, currency: "sar", interval: "month", provider: "tap" })
    assert.equal(bad.ok, false)
    const price = normalizeClientPrice({ amountCents: 4900, currency: "SAR", interval: "month", provider: "tap" })
    assert.equal(price.ok, true)
    if (!price.ok) return
    assert.equal(price.price.currency, "sar")
    const invoice = invoiceForPrice(price.price, Date.parse("2026-09-30T00:00:00Z"))
    assert.equal(invoice.periodEnd, "2026-10-30T00:00:00.000Z")
    assert.equal(invoice.dueAt, invoice.periodStart)
    assert.equal(majorAmount(1500, "KWD"), "1.500")
    assert.equal(majorAmount(4900, "sar"), "49.00")
  })
})

describe("trials, upgrades, and dunning", () => {
  const now = Date.parse("2026-09-30T00:00:00Z")

  it("charges for an upgrade and schedules a downgrade", () => {
    assert.equal(classifyChange("creator", "agency"), "upgrade")
    const upgrade = schedulePlanChange({ currentPlan: "creator", nextPlan: "agency", periodEnd: "2026-10-30T00:00:00Z", nowMs: now })
    assert.equal(upgrade.requiresPayment, true)
    assert.equal(upgrade.immediatePlan, null)
    const downgrade = schedulePlanChange({ currentPlan: "agency", nextPlan: "creator", periodEnd: "2026-10-30T00:00:00Z", nowMs: now })
    assert.equal(downgrade.scheduledPlan, "creator")
    assert.equal(downgrade.requiresPayment, false)
  })

  it("allows one trial and walks the dunning timeline", () => {
    const trial = startTrial({ currentPlan: "creator_free", requestedPlan: "creator", alreadyTrialed: false, nowMs: now })
    assert.equal(trial.ok, true)
    const again = startTrial({ currentPlan: "monthly", requestedPlan: "agency", alreadyTrialed: false, nowMs: now })
    assert.equal(again.ok, false)

    const pastDue = dunningAction({
      planId: "creator", status: "active", trialEndsAt: null, periodEnd: "2026-09-01T00:00:00Z", graceUntil: null, dunningStep: 0, cancelAtPeriodEnd: false, scheduledPlanId: null,
    }, now)
    assert.equal(pastDue.type, "mark_past_due")

    const suspend = dunningAction({
      planId: "creator", status: "past_due", trialEndsAt: null, periodEnd: "2026-09-01T00:00:00Z", graceUntil: "2026-09-20T00:00:00Z", dunningStep: 2, cancelAtPeriodEnd: false, scheduledPlanId: null,
    }, now)
    assert.equal(suspend.type, "suspend")

    const ended = dunningAction({
      planId: "creator", status: "trialing", trialEndsAt: "2026-09-01T00:00:00Z", periodEnd: null, graceUntil: null, dunningStep: 0, cancelAtPeriodEnd: false, scheduledPlanId: null,
    }, now)
    assert.deepEqual(ended, { type: "trial_expired", planId: "creator_free" })

    const cancel = dunningAction({
      planId: "creator", status: "active", trialEndsAt: null, periodEnd: "2026-09-01T00:00:00Z", graceUntil: null, dunningStep: 0, cancelAtPeriodEnd: true, scheduledPlanId: null,
    }, now)
    assert.equal(cancel.type, "cancel")
  })
})

describe("Meta data deletion callback", () => {
  it("round-trips a signed request and returns a confirmation url", async () => {
    const saved = {
      meta: process.env.META_APP_SECRET,
      facebook: process.env.FACEBOOK_APP_SECRET,
      instagram: process.env.INSTAGRAM_APP_SECRET,
    }
    const secret = "phase7-meta-secret"
    process.env.META_APP_SECRET = secret
    try {
      const signed = signMetaRequest({ user_id: "1784140001" }, secret)
      assert.equal(parseSignedRequest(signed, secret)?.user_id, "1784140001")
      assert.equal(parseSignedRequest(signed, "wrong"), null)

      const supabase = db({
        users: [{ id: 7, account_id: "acc", business_account_id: "1784140001" }],
        platform_connections: [{ id: "conn-1", page_id: "1784140001" }],
        contacts: [],
        conversations: [],
        data_deletion_requests: [],
      })
      const request = new Request("https://helixa.test/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signed_request: signed }),
      })
      const response = await handleMetaDataDeletion(request, supabase)
      assert.equal(response.status, 200)
      const body = await response.json()
      const origin = process.env.NEXT_PUBLIC_APP_URL || "https://helixa.test"
      assert.match(body.confirmation_code, /^hx_[a-f0-9]{18}$/)
      assert.equal(body.url, deletionCallbackBody(origin, body.confirmation_code).url)
      assert.ok(supabase.writes.some((write) => write.table === "users" && write.values?.access_token === "revoked_meta"))
      assert.ok(supabase.writes.some((write) => write.table === "contacts" && write.op === "delete"))

      const bad = await handleMetaDataDeletion(new Request("https://helixa.test/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signed_request: "aaaa.bbbb" }),
      }), supabase)
      assert.equal(bad.status, 400)

      const cleared = await applyMetaCallback(supabase, "1784140001", "deauthorize")
      assert.equal(cleared.profiles, 1)

      delete process.env.META_APP_SECRET
      delete process.env.FACEBOOK_APP_SECRET
      delete process.env.INSTAGRAM_APP_SECRET
      const missing = await handleMetaDataDeletion(new Request("https://helixa.test/api/meta/data-deletion", { method: "POST" }), db({}))
      assert.equal(missing.status, 503)
    } finally {
      if (saved.meta === undefined) delete process.env.META_APP_SECRET
      else process.env.META_APP_SECRET = saved.meta
      if (saved.facebook === undefined) delete process.env.FACEBOOK_APP_SECRET
      else process.env.FACEBOOK_APP_SECRET = saved.facebook
      if (saved.instagram === undefined) delete process.env.INSTAGRAM_APP_SECRET
      else process.env.INSTAGRAM_APP_SECRET = saved.instagram
    }
  })
})

describe("Arabic reports and bot copy", () => {
  it("shapes Arabic into presentation forms and keeps English bot strings exact", () => {
    assert.equal(shapeForPdf("مرحبا"), "\uFE8E\uFE92\uFEA3\uFEAE\uFEE3")
    assert.equal(shapeForPdf("لا"), "\uFEFB")
    assert.deepEqual(publicReplies("en"), ["Check your inbox! 📥", "Sent you a message! 🔥", "Check your DMs! ✨"])
    assert.equal(followSubtitle("en", "us"), "Please follow @us to see this.")
    assert.equal(botText("en", "contentLocked"), "Content locked")
    assert.equal(botText("en", "follow"), "Follow")
    assert.equal(botText("en", "followed"), "I Followed!")
    assert.match(botText("ar", "public1"), /شيك/)
    assert.match(followSubtitle("ar", "helixa"), /تابع @helixa/)
  })

  it("embeds an Arabic font in a client report", async () => {
    const bytes = await renderReportPdf({
      appName: "Helixa",
      clientName: "عيادة النور",
      periodLabel: "سبتمبر 2026",
      kpis: { conversations: 12, newContacts: 4, orders: 2, revenueCents: 4900, aiReplies: 30, handoffs: 1 },
    })
    assert.match(Buffer.from(bytes).toString("latin1"), /^%PDF/)
    const { PDFDocument, PDFName } = await import("pdf-lib")
    const loaded = await PDFDocument.load(bytes)
    const resources = loaded.getPage(0).node.Resources()
    assert.ok(resources?.lookup(PDFName.of("Font")))
    assert.ok(bytes.byteLength > 8_000)
  })
})
