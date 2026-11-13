import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isPlatformHost, normalizeHost } from "@/lib/agency/tenant"
import { checkRequest, MemoryLimiter, takeDbSlot } from "@/lib/security/http-limits"

// One per server instance; survives between requests on a warm instance.
const memory = new MemoryLimiter()

export async function proxy(request: NextRequest) {
  // Rate and size limits for every API route, before any other work
  // (including the Supabase session lookup below).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const decision = await checkRequest(
      { pathname: request.nextUrl.pathname, method: request.method, headers: request.headers },
      { memory, db: (key, limit, windowSeconds) => takeDbSlot(key, limit, windowSeconds) },
    )
    if (!decision.allowed) {
      const message =
        decision.status === 413 ? "Request body too large" :
        decision.status === 503 ? "Temporarily unavailable, try again shortly" :
        "Too many requests, slow down"
      return NextResponse.json(
        { error: message, code: decision.status === 413 ? "payload_too_large" : "rate_limited" },
        {
          status: decision.status,
          headers: decision.retryAfter ? { "Retry-After": String(decision.retryAfter) } : undefined,
        },
      )
    }
  }

  const requestHeaders = new Headers(request.headers)
  const agencyId = await agencyForHost(request.headers.get("x-forwarded-host") || request.headers.get("host"))
  if (agencyId) {
    requestHeaders.set("x-cyreax-agency", agencyId)
    requestHeaders.set("x-helixa-agency", agencyId)
  }
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return supabaseResponse

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This call is what actually refreshes the token if it's expired —
  // do not remove it even though the return value isn't used directly.
  await supabase.auth.getUser()

  if (agencyId) {
    supabaseResponse.cookies.set("cyreax_agency", agencyId, { path: "/", sameSite: "lax" })
    supabaseResponse.cookies.set("helixa_agency", agencyId, { path: "/", sameSite: "lax" })
  }
  return supabaseResponse
}

async function agencyForHost(rawHost: string | null): Promise<string | null> {
  const host = normalizeHost(rawHost)
  if (!host || isPlatformHost(host)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const response = await fetch(
      `${url}/rest/v1/agencies?custom_domain=eq.${encodeURIComponent(host)}&select=id&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!response.ok) return null
    const rows = await response.json()
    return rows?.[0]?.id || null
  } catch {
    return null
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
