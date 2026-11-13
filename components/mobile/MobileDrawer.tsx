"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  X,
  MessageSquare,
  Zap,
  Sparkles,
  Users,
  CreditCard,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowUpDown,
  MoreHorizontal,
  LogOut,
  Shield,
  Bell,
  Globe,
  Key,
  Webhook,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceUsage } from "@/hooks/use-workspace-usage"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { BRAND } from "@/lib/brand"
import useSWR from "swr"

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
  username?: string
  email?: string | null
  userRole?: string | null
  onLogout?: () => void
}

export function MobileDrawer({
  isOpen,
  onClose,
  username = "Workspace owner",
  email,
  userRole,
  onLogout,
}: MobileDrawerProps) {
  const pathname = usePathname()
  const { language } = useLanguage()
  const isRtl = language === "ar"

  const drawerRef = useRef<HTMLDivElement>(null)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [automationsOpen, setAutomationsOpen] = useState(true)
  const [settingsSubmenuOpen, setSettingsSubmenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Real workspace usage
  const { usage } = useWorkspaceUsage()
  const workspaceName = usage?.workspace?.name || "Workspace"
  const planName = usage?.plan?.name || "Pro plan"

  // Unread count
  const { data: inboxData } = useSWR<{ unreadCount?: number }>(
    isOpen ? "/api/inbox/conversations?limit=1" : null,
    (url) => fetch(url).then((r) => (r.ok ? r.json() : {})),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )
  const unreadCount = inboxData?.unreadCount ?? 0

  // Close drawer on path change
  useEffect(() => {
    onClose()
    setSettingsSubmenuOpen(false)
    setUserMenuOpen(false)
  }, [pathname])

  // Body scroll lock & Esc key listener
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsSubmenuOpen) {
          setSettingsSubmenuOpen(false)
        } else {
          onClose()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, settingsSubmenuOpen, onClose])

  // Swipe to close handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const currentTouch = e.targetTouches[0].clientX
    const diff = touchStart - currentTouch

    if (!isRtl && diff > 70) {
      onClose()
      setTouchStart(null)
    } else if (isRtl && diff < -70) {
      onClose()
      setTouchStart(null)
    }
  }

  if (!isOpen) return null

  // Initials for avatar
  const initials =
    workspaceName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "WS"

  const userInitials =
    username
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "WO"

  // Usage progress
  const aiUsed = usage?.used?.aiReplies ?? 8240
  const aiLimit = usage?.limits?.aiReplies ?? 10000
  const aiRatio = aiLimit > 0 ? aiUsed / aiLimit : 0
  const formattedAiUsed = new Intl.NumberFormat("en-US").format(aiUsed)
  const formattedAiLimit = aiLimit === -1 ? "Unlimited" : new Intl.NumberFormat("en-US").format(aiLimit)

  const AUTOMATION_SUB_LINKS = [
    { href: "/dashboard/automations", label: "Flows" },
    { href: "/dashboard/automations?tab=keywords", label: "Keywords" },
    { href: "/dashboard/growth", label: "Comment to DM" },
    { href: "/dashboard/broadcasts", label: "Broadcasts" },
  ]

  const SETTINGS_SUB_LINKS = [
    { href: "/dashboard/settings/team", label: "Team & White-label", icon: Users },
    { href: "/dashboard/settings/notifications", label: "Notifications", icon: Bell },
    { href: "/dashboard/settings/api-keys", label: "API Keys", icon: Key },
    { href: "/dashboard/settings/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/dashboard/connected-platforms", label: "Connected Platforms", icon: Globe },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation drawer"
      className="fixed inset-0 z-50 flex md:hidden select-none"
    >
      {/* 50% Scrim Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* 320px Sheet (max 85vw) */}
      <div
        ref={drawerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className={cn(
          "relative z-10 w-[320px] max-w-[85vw] h-full bg-[var(--s1)] border-e border-[var(--line)] flex flex-col justify-between shadow-2xl transition-transform ease-out duration-200 overflow-hidden",
          isRtl ? "animate-in slide-in-from-right" : "animate-in slide-in-from-left"
        )}
      >
        {/* Main Menu Panel vs Settings Submenu Panel */}
        <div className="relative flex-1 overflow-hidden">
          {/* MAIN MENU */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-between overflow-y-auto scrollbar-none transition-transform duration-200 ease-out",
              settingsSubmenuOpen
                ? isRtl
                  ? "translate-x-full opacity-0 pointer-events-none"
                  : "-translate-x-full opacity-0 pointer-events-none"
                : "translate-x-0 opacity-100"
            )}
          >
            {/* Header + Nav Items */}
            <div className="p-4 space-y-4">
              {/* Top Bar: Brand Logo + Wordmark + Close Button */}
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/brand/cyreax-mark-transparent.png"
                    alt={BRAND.name}
                    className="w-6 h-6 object-contain"
                  />
                  <span className="font-bold tracking-tight text-[15px] text-[var(--t1)]">
                    CYREAX <span className="text-[var(--gold)]">DM</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close drawer"
                  className="w-8 h-8 rounded-[6px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Workspace Switcher Card */}
              <div className="p-2.5 rounded-[10px] bg-[var(--s2)] border border-[var(--line)] flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--line2)] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[11px] font-bold text-[var(--t1)] shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--t1)] leading-tight truncate">
                      {workspaceName}
                    </p>
                    <p className="text-[11px] text-[var(--t3)] leading-tight mt-0.5 capitalize truncate">
                      {planName}
                    </p>
                  </div>
                </div>
                <ArrowUpDown className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
              </div>

              {/* Primary Navigation Items (44px tall each) */}
              <nav className="space-y-1 pt-1" aria-label="Drawer links">
                {/* Inbox */}
                <Link
                  href="/dashboard/inbox"
                  className={cn(
                    "h-11 px-3 rounded-[8px] flex items-center justify-between text-[13.5px] font-medium transition-colors cursor-pointer",
                    pathname.startsWith("/dashboard/inbox")
                      ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                      : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-[var(--t3)]" />
                    <span>Inbox</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--s3)] border border-[var(--line2)] font-mono text-[11px] text-[var(--t2)] font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </Link>

                {/* Automations (Expandable Group) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setAutomationsOpen(!automationsOpen)}
                    className={cn(
                      "w-full h-11 px-3 rounded-[8px] flex items-center justify-between text-[13.5px] font-medium transition-colors cursor-pointer",
                      pathname.startsWith("/dashboard/automations") || pathname.startsWith("/dashboard/growth") || pathname.startsWith("/dashboard/broadcasts")
                        ? "text-[var(--t1)] font-semibold"
                        : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-[var(--t3)]" />
                      <span>Automations</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-[var(--t3)] transition-transform duration-200",
                        automationsOpen ? "rotate-180" : "rotate-0"
                      )}
                    />
                  </button>

                  {/* Children hanging off 1px line2 vertical connector */}
                  {automationsOpen && (
                    <div className="relative ms-5 ps-4 py-1 space-y-1 border-s border-[var(--line2)]">
                      {AUTOMATION_SUB_LINKS.map((sub) => {
                        const isSubActive = pathname === sub.href
                        return (
                          <Link
                            key={sub.label}
                            href={sub.href}
                            className={cn(
                              "relative h-9 px-2.5 rounded-[6px] text-[13px] flex items-center transition-colors cursor-pointer",
                              isSubActive
                                ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                                : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                            )}
                          >
                            {/* 2px Gold Indicator Bar on connector */}
                            {isSubActive && (
                              <span
                                className="absolute -start-[17px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[var(--gold)] rounded-full"
                                aria-hidden="true"
                              />
                            )}
                            <span>{sub.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* AI Agent */}
                <Link
                  href="/dashboard/ai-engine"
                  className={cn(
                    "h-11 px-3 rounded-[8px] flex items-center gap-3 text-[13.5px] font-medium transition-colors cursor-pointer",
                    pathname.startsWith("/dashboard/ai-engine")
                      ? "bg-[var(--s3)] text-[var(--gold)] font-semibold"
                      : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                  )}
                >
                  <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                  <span>AI agent</span>
                </Link>

                {/* Contacts */}
                <Link
                  href="/dashboard/contacts"
                  className={cn(
                    "h-11 px-3 rounded-[8px] flex items-center gap-3 text-[13.5px] font-medium transition-colors cursor-pointer",
                    pathname.startsWith("/dashboard/contacts")
                      ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                      : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                  )}
                >
                  <Users className="w-4 h-4 text-[var(--t3)]" />
                  <span>Contacts</span>
                </Link>

                {/* Billing */}
                <Link
                  href="/dashboard/billing"
                  className={cn(
                    "h-11 px-3 rounded-[8px] flex items-center gap-3 text-[13.5px] font-medium transition-colors cursor-pointer",
                    pathname.startsWith("/dashboard/billing")
                      ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                      : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                  )}
                >
                  <CreditCard className="w-4 h-4 text-[var(--t3)]" />
                  <span>Billing</span>
                </Link>

                {/* Settings with Slide-in Trigger */}
                <button
                  type="button"
                  onClick={() => setSettingsSubmenuOpen(true)}
                  className="w-full h-11 px-3 rounded-[8px] flex items-center justify-between text-[13.5px] font-medium text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-[var(--t3)]" />
                    <span>Settings</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--t3)]" />
                </button>
              </nav>
            </div>

            {/* Bottom Section: AI Replies Meter + User Row */}
            <div className="p-4 border-t border-[var(--line)] space-y-4 bg-[var(--s1)] shrink-0">
              {/* Compact AI-Replies Usage Meter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--t3)] font-medium">AI replies</span>
                  <span className="font-mono text-[var(--t2)] font-semibold tabular-nums">
                    {formattedAiUsed} / {formattedAiLimit}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-[var(--s3)] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      aiRatio >= 1 ? "bg-[var(--amber)]" : "bg-[var(--gold)]"
                    )}
                    style={{ width: `${Math.min(100, Math.max(aiRatio >= 1 ? 100 : 4, Math.round(aiRatio * 100)))}%` }}
                  />
                </div>
              </div>

              {/* User Row */}
              <div className="relative">
                <div className="flex items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[11px] font-bold text-[var(--t1)] shrink-0">
                      {userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--t1)] leading-tight truncate">
                        {username || "Workspace owner"}
                      </p>
                      <p className="text-[11px] text-[var(--t3)] leading-tight mt-0.5 truncate">
                        {email ? "Signed in" : "Active session"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    aria-label="User menu"
                    className="w-7 h-7 rounded-[6px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {userMenuOpen && (
                  <div className="absolute bottom-full mb-2 end-0 w-44 rounded-[8px] bg-[var(--s2)] border border-[var(--line)] shadow-xl p-1 z-30 space-y-0.5 animate-in fade-in duration-150">
                    {onLogout && (
                      <button
                        type="button"
                        onClick={onLogout}
                        className="w-full h-8 px-2.5 rounded-[5px] text-[12px] text-[var(--red)] hover:bg-[var(--redbg)] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log out</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SETTINGS SLIDE-IN SUBMENU */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-between overflow-y-auto scrollbar-none transition-transform duration-200 ease-out bg-[var(--s1)]",
              settingsSubmenuOpen
                ? "translate-x-0 opacity-100"
                : isRtl
                ? "-translate-x-full opacity-0 pointer-events-none"
                : "translate-x-full opacity-0 pointer-events-none"
            )}
          >
            <div className="p-4 space-y-3">
              {/* Back Row */}
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setSettingsSubmenuOpen(false)}
                  className="p-1 rounded-[6px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center gap-1.5 text-[12.5px] font-medium transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to menu</span>
                </button>
              </div>

              <div className="pt-1">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--t3)] font-semibold px-2 mb-2">
                  Settings
                </h4>
                <div className="space-y-1">
                  {SETTINGS_SUB_LINKS.map((item) => {
                    const Icon = item.icon
                    const isSubActive = pathname.startsWith(item.href)
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                          "h-10 px-3 rounded-[8px] text-[13px] flex items-center gap-3 transition-colors cursor-pointer",
                          isSubActive
                            ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                            : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                        )}
                      >
                        <Icon className="w-4 h-4 text-[var(--t3)]" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
