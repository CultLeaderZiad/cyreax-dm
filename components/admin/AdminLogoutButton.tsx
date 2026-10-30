"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

export default function AdminLogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (e) {
      console.error("Logout failed:", e)
    }
    // Also clear localStorage just in case they switch back to customer view
    localStorage.removeItem("ig_account_id")
    localStorage.removeItem("ig_user_id")
    localStorage.removeItem("ig_username")
    localStorage.removeItem("ig_profile_pic")
    
    router.push("/login")
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      title="Log out"
      className="p-1.5 ms-2 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
    >
      <LogOut className="w-4 h-4" />
    </button>
  )
}
