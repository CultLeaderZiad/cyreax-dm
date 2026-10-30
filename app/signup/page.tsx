"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import { Suspense } from "react"
import BackToHome from "@/components/ui/back-to-home"
import { Mail } from "lucide-react"
import { BrandLogo } from "@/components/ui/BrandLogo"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { PasswordInput } from "@/components/ui/password-input"

function SignupForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreeError, setAgreeError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const planId = searchParams.get("plan_id")
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!agreeTerms) {
      setAgreeError(true)
      return
    }
    setAgreeError(false)

    setLoading(true)
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback${planId ? `?next=/checkout/${planId}` : ''}`,
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback${planId ? `?next=/checkout/${planId}` : ''}`,
      },
    })
    
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#03010A] py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <BackToHome />
        <FrontBackground />
        <div className="w-full max-w-md space-y-6 bg-[#03010A]/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 text-center relative z-10 shadow-2xl">
          <div className="flex justify-center mb-1">
            <BrandLogo variant="wordmark" size="md" />
          </div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5a93c]/10 border border-[#e5a93c]/20 text-[#e5a93c]">
            <Mail className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Check your email
            </h2>
            <p className="text-sm text-zinc-400">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>. Click the link to activate your account and start your 7-day trial.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full rounded-xl bg-[#e5a93c] hover:bg-[#d4952b] py-2.5 px-4 text-xs font-bold uppercase tracking-wider font-mono-ui text-black transition-all shadow-lg shadow-[#e5a93c]/20"
          >
            Return to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#03010A] py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <BackToHome />
      <FrontBackground />
      <div className="absolute inset-0 bg-gradient-to-t from-[#03010A] via-[#03010A]/80 to-[#03010A]/30 pointer-events-none" />

      <div className="w-full max-w-md space-y-6 bg-[#03010A]/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 relative z-10 shadow-2xl">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="wordmark" size="md" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Start your free trial
          </h2>
          <p className="mt-1.5 text-xs text-zinc-400">
            Get 7 days of full access. No credit card required.
          </p>
        </div>
        <form className="mt-6 space-y-5" onSubmit={handleEmailSignup}>
          {error && (
            <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#e5a93c]/50 focus:ring-1 focus:ring-[#e5a93c]/40 transition-all"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked)
                  if (e.target.checked) setAgreeError(false)
                }}
                aria-describedby={agreeError ? "agree-error" : undefined}
                aria-invalid={agreeError}
                className="mt-0.5 w-4 h-4 accent-[#e5a93c] cursor-pointer"
              />
              <span className="text-xs text-zinc-400 leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-[#e5a93c] hover:underline">Terms of Service</Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-[#e5a93c] hover:underline">Privacy Policy</Link>
              </span>
            </label>
            {agreeError && (
              <p id="agree-error" role="alert" className="text-[11px] text-red-400 ps-7">
                You must agree to the Terms and Privacy Policy before creating an account.
              </p>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-xl bg-[#e5a93c] hover:bg-[#d4952b] py-2.5 px-4 text-xs font-bold uppercase tracking-wider font-mono-ui text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5a93c] disabled:opacity-50 transition-all shadow-lg shadow-[#e5a93c]/20 cursor-pointer"
            >
              {loading ? "Creating account..." : "Create free account"}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0b0c10] px-3 text-zinc-500 font-mono-ui uppercase tracking-wider">Or continue with</span>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handleGoogleSignup}
              disabled={loading || !agreeTerms}
              title={agreeTerms ? "Sign up with Google" : "Agree to the Terms and Privacy Policy first"}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider font-mono-ui text-white hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
                  fill="#EA4335"
                />
                <path
                  d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
                  fill="#4285F4"
                />
                <path
                  d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
                  fill="#FBBC05"
                />
                <path
                  d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26538 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
                  fill="#34A853"
                />
              </svg>
              Google
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#e5a93c] hover:text-[#d4952b] transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <SignupForm />
    </Suspense>
  )
}
