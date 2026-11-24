"use client"

import { useState } from "react"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import BackToHome from "@/components/ui/back-to-home"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { BrandLogo } from "@/components/ui/BrandLogo"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  
  let supabase: ReturnType<typeof getSupabaseBrowserClient>
  try {
    supabase = getSupabaseBrowserClient()
  } catch (e) {
    console.error("[forgot-password] Failed to initialize Supabase client:", e)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-8">
          <h1 className="text-2xl font-bold text-red-500">Application Configuration Error</h1>
          <p className="text-neutral-400">This application is not properly configured. Please contact the administrator.</p>
        </div>
      </div>
    )
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <BackToHome />
      <FrontBackground />
      <div className="absolute inset-0 bg-gradient-to-t from-[#03010A] via-[#03010A]/80 to-[#03010A]/30 pointer-events-none" />

      <div className="w-full max-w-md space-y-6 bg-[#03010A]/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 relative z-10 shadow-2xl">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <BrandLogo variant="wordmark" size="md" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Reset your password
          </h2>
          <p className="mt-1.5 text-xs text-zinc-400">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>
        
        {success ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-400 leading-relaxed text-center">
            Check your email for a link to reset your password. If it doesn&apos;t appear within a few minutes, check your spam folder.
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleResetPassword}>
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
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
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !email}
                className="group relative flex w-full justify-center rounded-xl bg-[#e5a93c] hover:bg-[#d4952b] py-2.5 px-4 text-xs font-bold uppercase tracking-wider font-mono-ui text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5a93c] disabled:opacity-50 transition-all shadow-lg shadow-[#e5a93c]/20 cursor-pointer"
              >
                {loading ? "Sending link..." : "Send reset link"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          <span>Remember your password?</span>
          <Link href="/login" className="font-semibold text-[#e5a93c] hover:text-[#d4952b] transition-colors">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
