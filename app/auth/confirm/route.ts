import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { safeAuthNext } from '@/lib/auth-redirect'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // `next` must be an in-app path; anything else falls back to /dashboard.
  const next = safeAuthNext(searchParams.get('next'), '/dashboard', origin)

  if (token_hash && type) {
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    
    if (!error) {
      // redirect user to specified redirect URL or root of app
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else {
    // If no token_hash is present, but this was a redirect from an implicit flow,
    // we should just redirect to next (which might handle the fragment on the client side)
    // or maybe they hit this directly. We will gracefully redirect to dashboard or login.
    const code = searchParams.get('code')
    if (code) {
      const supabase = await getSupabaseServerClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // redirect the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/login?error=auth_confirm_failed`)
}
