export const dynamic = "force-dynamic"

import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { captureException, sentryDsn, sentryStoreUrl } from "@/lib/monitoring"

/**
 * GET /api/admin/sentry-test (admins only)
 * Sends one test error to Sentry so you can confirm SENTRY_DSN works.
 * Open it in the browser while signed in as an admin, then check Sentry -> Issues.
 */
export async function GET(request: NextRequest) {
  const result = await requireAdmin(request)
  if (result.response) return result.response

  const dsn = sentryDsn()
  if (!dsn) return NextResponse.json({ ok: false, problem: "SENTRY_DSN is not set in this deployment. Add it in Vercel and redeploy." })
  if (!sentryStoreUrl(dsn)) return NextResponse.json({ ok: false, problem: "SENTRY_DSN is set but is not a valid DSN (check for spaces or line breaks)." })

  await captureException(new Error("Cyreax DM test error: Sentry is connected"), { source: "admin-sentry-test" })
  return NextResponse.json({ ok: true, message: "Test error sent. It should appear in Sentry -> Issues within a minute." })
}
