export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") || "https"
  const currentOrigin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "https://cyreax-dm.vercel.app")

  let redirectUri = `${currentOrigin}/api/facebook/callback`
  if (process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI && process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI.includes(host || "")) {
    redirectUri = process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI
  }

  if (!clientId) {
    console.error("[FB Auth] Missing configuration: App ID is not set.")
    return NextResponse.json({ error: "Facebook integration is not configured. Please contact support." }, { status: 503 })
  }

  // Requested scopes for managing pages and messages
  const scope = "pages_manage_metadata,pages_messaging,pages_read_engagement,pages_show_list"
  
  // Use auth_type=rerequest so Facebook always prompts the user to select ANY page,
  // preventing locking into a previously selected or hardcoded account.
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&auth_type=rerequest`
  
  return NextResponse.redirect(url)
}
