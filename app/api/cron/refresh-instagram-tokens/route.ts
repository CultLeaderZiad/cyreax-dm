export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { unauthorizedCronResponse } from "@/lib/cron-auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import {
  isMetaAuthError,
  markInstagramReconnect,
  tokenNeedsRefresh,
  updateUserTokenFields,
} from "@/lib/instagram-token"
import {
  isPlaceholderToken,
  openAccessToken,
  sealAccessToken,
  tokenNeedsReseal,
} from "@/lib/token-crypto"
import { refreshTikTokTokens } from "@/lib/tiktok/oauth"

/**
 * GET /api/cron/refresh-instagram-tokens
 *
 * Refreshes long-lived Instagram user tokens that expire within 10 days, and
 * reseals plaintext or legacy ciphertext so stored tokens become `enc:v1:`.
 * Facebook page tokens are resealed but not refreshed here.
 *
 * Fails closed unless Authorization is `Bearer $CRON_SECRET`.
 * Missing phase-1 columns are skipped so this can run before the SQL migration.
 */

const REFRESH_URL = "https://graph.instagram.com/refresh_access_token"
const DEFAULT_EXPIRES_IN = 60 * 24 * 60 * 60
const RESEAL_LIMIT = 100

type UserRow = {
  id: string | number
  access_token?: string | null
  token_expires_at?: string | null
  token_refreshed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
  reconnect_required?: boolean | null
}

function missingColumn(message: string | undefined, column: string) {
  return Boolean(message && message.toLowerCase().includes(column.toLowerCase()))
}

export async function GET(request: NextRequest) {
  const denied = unauthorizedCronResponse(request)
  if (denied) return denied

  const supabase = await getSupabaseBypassClient()
  const summary = {
    scanned: 0,
    refreshed: 0,
    reconnect: 0,
    resealed: 0,
    skipped: 0,
    errors: 0,
  }

  const userColumns = [
    "id",
    "access_token",
    "token_expires_at",
    "token_refreshed_at",
    "updated_at",
    "created_at",
    "reconnect_required",
  ]
  let users: UserRow[] = []
  let selectColumns = [...userColumns]
  for (let attempt = 0; attempt < userColumns.length; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select(selectColumns.join(", "))
      .not("access_token", "is", null)
      .limit(500)
    if (!error) {
      users = (data || []) as unknown as UserRow[]
      break
    }
    const drop = userColumns.find((column) => column !== "id" && column !== "access_token" && missingColumn(error.message, column))
    if (!drop) {
      console.error("[cron/refresh-instagram-tokens] user select failed:", error.message)
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 })
    }
    selectColumns = selectColumns.filter((column) => column !== drop)
  }

  summary.scanned = users.length

  for (const row of users) {
    if (!row.access_token || isPlaceholderToken(row.access_token)) {
      summary.skipped++
      continue
    }

    let plain: string | null = null
    try {
      plain = openAccessToken(row.access_token)
    } catch (error) {
      console.error("[cron/refresh-instagram-tokens] decrypt failed for user", row.id, error)
      await markInstagramReconnect(supabase, row.id)
      summary.reconnect++
      continue
    }
    if (!plain || isPlaceholderToken(plain)) {
      summary.skipped++
      continue
    }

    if (tokenNeedsRefresh(row)) {
      try {
        const url = `${REFRESH_URL}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(plain)}`
        const res = await fetch(url, { cache: "no-store" })
        const json = await res.json()
        if (json?.access_token) {
          const expiresIn = Number(json.expires_in) || DEFAULT_EXPIRES_IN
          const { error } = await updateUserTokenFields(supabase, row.id, {
            access_token: sealAccessToken(json.access_token),
            token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            token_refreshed_at: new Date().toISOString(),
            reconnect_required: false,
          })
          if (error) {
            console.error("[cron/refresh-instagram-tokens] update failed:", error.message)
            summary.errors++
          } else {
            summary.refreshed++
          }
          continue
        }
        if (isMetaAuthError(json?.error)) {
          await markInstagramReconnect(supabase, row.id)
          summary.reconnect++
          continue
        }
        console.warn("[cron/refresh-instagram-tokens] refresh rejected for user", row.id, json?.error?.message || res.status)
        summary.errors++
        continue
      } catch (error) {
        console.error("[cron/refresh-instagram-tokens] refresh request failed:", error)
        summary.errors++
        continue
      }
    }

    if (summary.resealed < RESEAL_LIMIT && tokenNeedsReseal(row.access_token)) {
      const { error } = await supabase
        .from("users")
        .update({ access_token: sealAccessToken(plain) })
        .eq("id", row.id)
      if (error) {
        console.error("[cron/refresh-instagram-tokens] reseal failed:", error.message)
        summary.errors++
      } else {
        summary.resealed++
      }
    }
  }

  if (summary.resealed < RESEAL_LIMIT) {
    const { data: connections, error } = await supabase
      .from("platform_connections")
      .select("id, access_token")
      .not("access_token", "is", null)
      .limit(200)
    if (error) {
      console.error("[cron/refresh-instagram-tokens] connection select failed:", error.message)
    } else {
      for (const connection of connections || []) {
        if (summary.resealed >= RESEAL_LIMIT) break
        if (!tokenNeedsReseal(connection.access_token)) continue
        try {
          const plain = openAccessToken(connection.access_token)
          if (!plain || isPlaceholderToken(plain)) continue
          const { error: updateError } = await supabase
            .from("platform_connections")
            .update({ access_token: sealAccessToken(plain) })
            .eq("id", connection.id)
          if (updateError) {
            summary.errors++
          } else {
            summary.resealed++
          }
        } catch (decryptError) {
          console.error("[cron/refresh-instagram-tokens] connection decrypt failed:", decryptError)
          summary.errors++
        }
      }
    }
  }

  let tiktok: unknown = null
  try {
    tiktok = await refreshTikTokTokens(supabase)
  } catch (error) {
    console.error("[cron/refresh-instagram-tokens] tiktok refresh error:", error)
    tiktok = { ok: false, error: "tiktok_refresh_failed" }
  }

  return NextResponse.json({ ok: true, ...summary, tiktok })
}
