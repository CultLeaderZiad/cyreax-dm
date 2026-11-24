const DASHBOARD_PATH = "/dashboard"

/**
 * Auth callback `next` must be an in-app path: one leading `/`, never `//`.
 * Backslashes are rejected because the URL parser turns them into `/`, so
 * `/\host` becomes the protocol-relative path `//host`.
 *
 * Hardened to strip tab/newline characters, verify the decoded path,
 * and validate that `new URL(next, origin).origin === origin`.
 */
export function safeAuthNext(
  next: string | null | undefined,
  fallbackOrOrigin: string = DASHBOARD_PATH,
  maybeOrigin?: string,
): string {
  let fallback = DASHBOARD_PATH
  let origin = "http://localhost"

  if (fallbackOrOrigin) {
    if (fallbackOrOrigin.startsWith("http://") || fallbackOrOrigin.startsWith("https://")) {
      origin = fallbackOrOrigin
    } else {
      fallback = fallbackOrOrigin
    }
  }

  if (maybeOrigin) {
    origin = maybeOrigin
  }

  if (!next || typeof next !== "string") {
    return fallback
  }

  // Strip tab and newline chars before checking
  const cleaned = next.replace(/[\t\r\n]/g, "")

  // Must start with "/", not "//", no backslashes
  if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.includes("\\")) {
    return fallback
  }

  // Check decoded string to prevent URL-encoded bypasses like /%2F%2Fevil.com or /%5cevil.com
  try {
    const decoded = decodeURIComponent(cleaned)
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
      return fallback
    }
  } catch {
    return fallback
  }

  // Reject unless its .origin === origin
  try {
    let baseOrigin = origin
    try {
      baseOrigin = new URL(origin).origin
    } catch {
      baseOrigin = "http://localhost"
    }

    const parsed = new URL(cleaned, baseOrigin)
    if (parsed.origin !== baseOrigin) {
      return fallback
    }
  } catch {
    return fallback
  }

  return cleaned
}


const PLAN_ID = /^[0-9a-f-]{36}$/i

/**
 * Where to send a customer after they sign up or log in having picked a plan.
 * Only a real plan id (uuid) is accepted, so the value that lands in the
 * redirect can never be anything but /checkout/<uuid>[?cycle=yearly].
 */
export function checkoutNext(planId: string | null | undefined, cycle?: string | null): string | null {
  if (!planId || !PLAN_ID.test(planId)) return null
  return `/checkout/${planId}${cycle === "yearly" ? "?cycle=yearly" : ""}`
}
