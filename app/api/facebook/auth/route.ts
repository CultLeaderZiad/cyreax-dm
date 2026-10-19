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

  const { searchParams } = new URL(request.url)
  // Only use config_id if explicitly requested by client; never default to WhatsApp config ID
  const configId = searchParams.get("config_id")

  let url: string
  if (configId) {
    // Facebook Login for Business uses a Configuration ID instead of manual scope string
    url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${encodeURIComponent(configId)}&response_type=code&override_default_response_type=true&auth_type=rerequest`
  } else {
    // Standard Facebook Login using scope (public_profile is required)
    const scope = "public_profile,pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging"
    url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&auth_type=rerequest`
  }

  return NextResponse.redirect(url)
}
