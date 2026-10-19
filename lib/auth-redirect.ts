const DASHBOARD_PATH = "/dashboard"

/**
 * Auth callback `next` must be an in-app path: one leading `/`, never `//`.
 * Backslashes are rejected because the URL parser turns them into `/`, so
 * `/\host` becomes the protocol-relative path `//host`.
 */
export function safeAuthNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DASHBOARD_PATH
  }
  return next
}
