"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import BackToHome from "@/components/ui/back-to-home"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { PasswordInput } from "@/components/ui/password-input"
import { BrandLogo } from "@/components/ui/BrandLogo"
import Link from "next/link"

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  
  const router = useRouter()

  // Create the client once; a missing config is reported after all hooks run
  // (hooks must not sit behind an early return).
  const [client] = useState<{ supabase: ReturnType<typeof getSupabaseBrowserClient> | null }>(() => {
    try {
      return { supabase: getSupabaseBrowserClient() }
    } catch (e) {
      console.error("[update-password] Failed to initialize Supabase client:", e)
      return { supabase: null }
    }
  })

  useEffect(() => {
    const supabase = client.supabase
    if (!supabase) return
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsValidSession(!!session)
    }

    checkSession()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsValidSession(true)
        } else if (event === "SIGNED_IN") {
          setIsValidSession(true)
        }
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [client])

  if (!client.supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-8">
          <h1 className="text-2xl font-bold text-red-500">Application Configuration Error</h1>
          <p className="text-neutral-400">This application is not properly configured. Please contact the administrator.</p>
        </div>
      </div>
    )
  }
  const supabase = client.supabase

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({
      password: password,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => {
        router.push("/dashboard")
      }, 3000)
    }
    setLoading(false)
  }

  if (isValidSession === false) {
    return (
      <div className="flex min-h-screen items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <BackToHome />
        <div className="w-full max-w-md space-y-6 bg-[#03010A]/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 relative z-10 text-center shadow-2xl">
          <div className="flex justify-center mb-1">
            <BrandLogo variant="wordmark" size="md" />
          </div>
          <h2 className="text-2xl font-bold text-white">Invalid or Expired Link</h2>
          <p className="text-zinc-400 text-xs mt-1">The password reset link has expired or is invalid. Please request a new one.</p>
          <button 
            onClick={() => router.push("/forgot-password")}
            className="mt-6 w-full justify-center rounded-xl bg-[#e5a93c] hover:bg-[#d4952b] py-2.5 px-4 text-xs font-bold uppercase tracking-wider font-mono-ui text-black cursor-pointer shadow-lg shadow-[#e5a93c]/20"
          >
            Request New Link
          </button>
        </div>
      </div>
    )
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
            Update your password
          </h2>
          <p className="mt-1.5 text-xs text-zinc-400">
            Enter your new password below.
          </p>
        </div>
        
        {success ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-400 leading-relaxed text-center">
            Your password has been successfully updated! Redirecting to your dashboard...
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleUpdatePassword}>
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}
            
            <div className="space-y-3">
              <div>
                <label htmlFor="password" className="sr-only">
                  New Password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm Password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !password || !confirmPassword || isValidSession === null}
                className="group relative flex w-full justify-center rounded-xl bg-[#e5a93c] hover:bg-[#d4952b] py-2.5 px-4 text-xs font-bold uppercase tracking-wider font-mono-ui text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5a93c] disabled:opacity-50 transition-all shadow-lg shadow-[#e5a93c]/20 cursor-pointer"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>

    </div>
  )
}

