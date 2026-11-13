export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { sealAccessToken } from "@/lib/token-crypto"
import { assertChannelConnect, limitPayload, PlanLimitError } from "@/lib/billing/enforce"
import {
  shortLivedTokenError,
  debugTokenWabaIds,
  exchangeEmbeddedSignupCode,
  fetchPhoneNumber,
  isPhoneNumberRegistered,
  listWabaPhoneNumbers,
  preparePhoneRegistration,
  registerPhoneNumber,
  registrationPinCipherToStore,
  subscribeWaba,
  type WhatsAppNumber,
} from "@/lib/whatsapp/connect"

/**
 * POST /api/whatsapp/connect
 *
 * Embedded Signup: `{ code, phone_number_id?, waba_id? }`
 * Manual fallback: `{ phone_number_id, access_token, waba_id? }`
 *
 * Each phone number is its own platform_connections row for this workspace.
 */
export async function POST(request: NextRequest) {
  const result = await requireSessionUser(request)
  if (result.response) return result.response
  const roleDenied = forbidBelow(result.user.workspace_role, "admin")
  if (roleDenied) return roleDenied

  let body: {
    code?: string
    phone_number_id?: string
    waba_id?: string
    access_token?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const manual = Boolean(body.access_token && body.phone_number_id)
  if (!manual && !body.code) {
    return NextResponse.json(
      { error: "Send an Embedded Signup code, or a phone number id and system-user token." },
      { status: 400 },
    )
  }

  let accessToken = body.access_token || ""
  if (manual) {
    const tokenProblem = await shortLivedTokenError(accessToken)
    if (tokenProblem) return NextResponse.json({ error: tokenProblem }, { status: 400 })
  }
  if (!manual) {
    const exchanged = await exchangeEmbeddedSignupCode(String(body.code))
    if (!exchanged.ok) return NextResponse.json({ error: exchanged.error }, { status: 502 })
    accessToken = exchanged.accessToken
  }

  const numbers = await resolveNumbers(accessToken, body.phone_number_id, body.waba_id)
  if (numbers.length === 0) {
    return NextResponse.json(
      { error: "No WhatsApp phone number could be verified with that token." },
      { status: 400 },
    )
  }

  const supabase = await getSupabaseBypassClient()
  let profile = result.igUser
  if (!profile?.id) {
    try {
      profile = await ensureTenantProfile(supabase, result.user, "workspace_managed", result.workspace?.id)
    } catch (error) {
      console.error("[whatsapp] profile:", error)
      return NextResponse.json({ error: "Could not prepare a workspace profile" }, { status: 500 })
    }
  }

  try {
    for (const number of numbers) {
      await assertChannelConnect(supabase, result.user, { platform: "whatsapp", pageId: number.phoneNumberId })
    }
  } catch (error) {
    if (error instanceof PlanLimitError) return NextResponse.json(limitPayload(error), { status: 402 })
    throw error
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("platform_connections")
    .select("page_id, metadata")
    .eq("user_id", profile.id)
    .eq("platform", "whatsapp")
  if (existingError) console.error("[whatsapp] existing numbers:", existingError)
  const existingByPhone = new Map<string, { metadata?: unknown }>()
  for (const row of existingRows || []) {
    if (row?.page_id) existingByPhone.set(String(row.page_id), row)
  }

  const wabaIds = new Set(numbers.map((number) => number.wabaId).filter(Boolean) as string[])
  if (body.waba_id) wabaIds.add(body.waba_id)
  const subscribed: string[] = []
  for (const wabaId of wabaIds) {
    if (await subscribeWaba(wabaId, accessToken)) subscribed.push(wabaId)
  }

  const failures: string[] = []
  const ready: Array<{ number: WhatsAppNumber; pinCipher: string | null }> = []
  for (const number of numbers) {
    const existing = existingByPhone.get(number.phoneNumberId)
    const plan = preparePhoneRegistration(number, existing?.metadata)
    let outcome: "skipped" | "registered" | "already-registered" = plan.action === "skip" ? "skipped" : "registered"
    if (plan.action === "register") {
      if (!plan.pin) {
        failures.push(`${numberLabel(number)}: WhatsApp registration needs a 6-digit PIN, and none could be created.`)
        continue
      }
      const registered = await registerPhoneNumber(number.phoneNumberId, accessToken, plan.pin)
      if (!registered.ok) {
        failures.push(`${numberLabel(number)}: ${registered.error}`)
        continue
      }
      outcome = registered.alreadyRegistered ? "already-registered" : "registered"
      if (!isPhoneNumberRegistered(number)) {
        number.status = "CONNECTED"
        number.platformType = "CLOUD_API"
      }
    }
    ready.push({ number, pinCipher: registrationPinCipherToStore(plan, outcome) })
  }

  if (ready.length === 0) {
    return NextResponse.json(
      { error: `WhatsApp registration failed. ${failures.join(" ")}` },
      { status: 502 },
    )
  }

  const saved = []
  for (const item of ready) {
    try {
      const row = await upsertNumber(supabase, {
        userId: profile.id,
        accountId: result.user.id,
        workspaceId: result.workspace?.id || profile.workspace_id || null,
        token: sealAccessToken(accessToken),
        number: item.number,
        subscribed: item.number.wabaId ? subscribed.includes(item.number.wabaId) : subscribed.length > 0,
        pinCipher: item.pinCipher,
      })
      if (row) saved.push(row)
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Failed to save connection" }, { status: 409 })
    }
  }
  if (saved.length === 0) {
    return NextResponse.json({ error: "The number was verified but could not be saved." }, { status: 500 })
  }
  if (failures.length > 0) {
    return NextResponse.json(
      {
        error: `Connected ${saved.length} WhatsApp number${saved.length === 1 ? "" : "s"}, but registration failed for the rest. ${failures.join(" ")}`,
        numbers: saved,
      },
      { status: 502 },
    )
  }
  return NextResponse.json({ success: true, numbers: saved })
}

function numberLabel(number: WhatsAppNumber): string {
  return number.displayPhoneNumber || number.phoneNumberId
}

async function resolveNumbers(accessToken: string, phoneNumberId?: string, wabaId?: string): Promise<WhatsAppNumber[]> {
  if (phoneNumberId) {
    const number = await fetchPhoneNumber(phoneNumberId, accessToken)
    if (!number) return []
    number.wabaId = wabaId || null
    return [number]
  }
  const wabas = wabaId ? [wabaId] : await debugTokenWabaIds(accessToken)
  const numbers: WhatsAppNumber[] = []
  for (const id of wabas) {
    numbers.push(...(await listWabaPhoneNumbers(id, accessToken)))
  }
  return numbers
}

async function upsertNumber(
  supabase: any,
  input: {
    userId: string | number
    accountId: string
    workspaceId: string | null
    token: string
    number: WhatsAppNumber
    subscribed: boolean
    pinCipher: string | null
  },
) {
  const metadata: Record<string, unknown> = {
    display_phone_number: input.number.displayPhoneNumber,
    verified_name: input.number.verifiedName,
    quality_rating: input.number.qualityRating,
    status: input.number.status,
    platform_type: input.number.platformType,
    waba_id: input.number.wabaId,
    webhook_subscribed: input.subscribed,
    cloud_api_registered: input.number.platformType === "CLOUD_API" && input.number.status === "CONNECTED",
    name: input.number.verifiedName || input.number.displayPhoneNumber || input.number.phoneNumberId,
  }
  if (input.pinCipher) metadata.registration_pin = input.pinCipher

  const fields: Record<string, unknown> = {
    user_id: input.userId,
    account_id: input.accountId,
    platform: "whatsapp",
    page_id: input.number.phoneNumberId,
    external_account_id: input.number.wabaId || input.number.phoneNumberId,
    access_token: input.token,
    metadata,
    workspace_id: input.workspaceId,
  }

  const { data: existing } = await supabase
    .from("platform_connections")
    .select("id, user_id")
    .eq("platform", "whatsapp")
    .eq("page_id", input.number.phoneNumberId)
    .maybeSingle()

  if (existing && String(existing.user_id) !== String(input.userId)) {
    throw new Error(`This WhatsApp number is already connected to another CYREAX DM account.`)
  }

  const write = existing
    ? await supabase.from("platform_connections").update(fields).eq("id", existing.id)
    : await supabase.from("platform_connections").insert(fields)
  if (write.error && input.workspaceId && /workspace_id/i.test(write.error.message || "")) {
    delete fields.workspace_id
    const retry = existing
      ? await supabase.from("platform_connections").update(fields).eq("id", existing.id)
      : await supabase.from("platform_connections").insert(fields)
    if (retry.error) {
      console.error("[whatsapp] save:", retry.error)
      return null
    }
  } else if (write.error) {
    console.error("[whatsapp] save:", write.error)
    return null
  }
  return {
    phone_number_id: input.number.phoneNumberId,
    display_phone_number: input.number.displayPhoneNumber,
    verified_name: input.number.verifiedName,
    waba_id: input.number.wabaId,
  }
}
