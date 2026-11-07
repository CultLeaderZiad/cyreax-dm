import { NextResponse } from 'next/server'
import { safeAuthNext } from '@/lib/auth-redirect'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  // `next` must be an in-app path; anything else falls back to /dashboard.
  const next = safeAuthNext(searchParams.get('next'), '/dashboard', origin)

  if (code) {
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
