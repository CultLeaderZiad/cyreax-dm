"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface BannerState {
  isActive: boolean
  type?: string
  message: string
  link: string
  content?: string
}

export function GlobalBanner() {
  const pathname = usePathname()
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (pathname?.startsWith("/dashboard")) return
    if (typeof window === "undefined") return
    // Check if dismissed in this session
    if (sessionStorage.getItem("banner_dismissed") === "true") return

    fetch("/api/settings/banner")
      .then(res => res.json())
      .then(data => {
        if (data && data.isActive) {
          setBanner(data)
          // Add a small delay for animation effect
          setTimeout(() => setIsVisible(true), 100)
        }
      })
      .catch(err => console.error("Failed to load banner", err))
  }, [pathname])

  // Do not render banner on dashboard pages or if inactive
  if (pathname?.startsWith("/dashboard") || !banner || !banner.isActive) {
    return null
  }

  const handleDismiss = () => {
    setIsVisible(false)
    sessionStorage.setItem("banner_dismissed", "true")
  }

  return (
    <div
      className={cn(
        "relative z-50 w-full bg-[#0e1015]/95 backdrop-blur-md text-zinc-200 border-b border-[#e5a93c]/20 shadow-[0_4px_20px_rgba(0,0,0,0.4)] overflow-hidden transition-all duration-500 ease-out",
        isVisible ? "h-auto py-2 opacity-100" : "h-0 py-0 opacity-0"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#e5a93c]/10 to-transparent translate-x-[-100%] animate-[shimmer_3s_infinite]" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-center">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#e5a93c]/10 border border-[#e5a93c]/25 text-[#e5a93c] text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#e5a93c]" />
            v2.0
          </span>
          <span className="text-zinc-300">{(banner.message || "").replace(/Helixa/gi, "CYREAX DM")}</span>
          
          {banner.link && (
            <Link 
              href={banner.link} 
              className="group inline-flex items-center gap-1 ms-2 px-2.5 py-0.5 rounded-full bg-[#e5a93c]/15 text-[#f3ba4f] hover:bg-[#e5a93c]/25 border border-[#e5a93c]/30 text-xs font-medium transition-colors"
            >
              <span>Learn more</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
        
        <button 
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
