"use client"

import React, { useState } from "react"
import { Key, ShieldAlert, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function SecuritySettingsSection() {
  const [browserLabel, setBrowserLabel] = React.useState("")
  React.useEffect(() => {
    // Read from this browser itself; no location is guessed.
    const ua = navigator.userAgent
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"
    const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : ""
    setBrowserLabel(os ? `${browser} on ${os}` : browser)
  }, [])

  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [logoutAllOpen, setLogoutAllOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.")
      return
    }

    setSavingPassword(true)
    setPasswordError("")

    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordError(error.message)
      } else {
        toast.success("Password updated")
        setNewPassword("")
        setConfirmPassword("")
      }
    } catch {
      setPasswordError("Failed to update password. Please try again.")
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogoutAll = async () => {
    setLoggingOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      toast.success("Signed out of all sessions")
      router.push("/login")
    } catch {
      toast.error("Error signing out")
    } finally {
      setLoggingOut(false)
      setLogoutAllOpen(false)
    }
  }

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Security
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Manage your password, active sessions, and multi-factor credentials.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        {/* Block 1: Password change */}
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Password
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Ensure your account is protected with a unique, long passphrase.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <label
                htmlFor="new-password"
                className="text-[11.5px] text-[var(--t2)] font-medium block"
              >
                New password
              </label>
              <PasswordInput
                id="new-password"
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (passwordError) setPasswordError("")
                }}
                className="w-full h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-3 text-[12.5px] text-[var(--t1)]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password"
                className="text-[11.5px] text-[var(--t2)] font-medium block"
              >
                Confirm password
              </label>
              <PasswordInput
                id="confirm-password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (passwordError) setPasswordError("")
                }}
                className="w-full h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-3 text-[12.5px] text-[var(--t1)]"
              />
              {passwordError && (
                <p className="text-[11px] text-[var(--red)] pt-1">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="pt-1 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={savingPassword || !newPassword}
                className="h-[30px] px-4 text-xs font-semibold"
              >
                {savingPassword ? "Updating..." : "Update password"}
              </Button>
            </div>
          </form>
        </div>

        {/* Block 2: Sessions */}
        <div className="pt-6 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Sessions
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              If you suspect unapproved access, sign out from all browser devices.
            </p>
          </div>

          <div className="space-y-3 max-w-md">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-3.5 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12px] font-medium text-[var(--t1)] block">
                  Current session
                </span>
                <span className="text-[11px] text-[var(--t3)] font-mono block">
                  {browserLabel || "This browser"}
                </span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
            </div>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setLogoutAllOpen(true)}
              className="h-[30px] text-xs font-medium"
            >
              Sign out everywhere
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={logoutAllOpen}
        onOpenChange={setLogoutAllOpen}
        title="Sign out of all sessions?"
        description="You will be disconnected on all devices, including mobile and other active browsers."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        loading={loggingOut}
        variant="destructive"
        onConfirm={handleLogoutAll}
      />
    </div>
  )
}
