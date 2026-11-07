"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  MessageSquare,
  Zap,
  Sparkles,
  Users,
  Megaphone,
  BarChart3,
  Share2,
  CreditCard,
  Settings,
  Search,
  ChevronRight,
  MoreHorizontal,
  HelpCircle,
  Globe,
  LogOut,
  Shield,
  Bell, LifeBuoy } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { BrandLogo } from "@/components/ui/BrandLogo"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher"
import { BRAND } from "@/lib/brand"

interface SidebarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "role"> {
  username?: string
  profilePic?: string | null
  email?: string | null
  userRole?: string | null
  plan?: string | null
  className?: string
  collapsed?: boolean
  onLogout?: () => void
  onNavigate?: () => void
}

export function Sidebar({
  className,
  username = "Creator",
  profilePic,
  email,
  userRole,
  plan,
  collapsed = false,
  onLogout,
  onNavigate,
  ...props
}: SidebarProps) {
  const pathname = usePathname()
  const { t, language, setLanguage } = useLanguage()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fetch unread inbox count
  const { data: inboxData } = useSWR<{ unreadCount?: number }>(
    "/api/inbox/conversations?limit=1",
    (url) => fetch(url).then((r) => r.ok ? r.json() : {}),
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )

  // Fetch real plan usage
  const { data: usageData } = useSWR<{
    usage?: { messages_count?: number; plan_limit?: number }
    plan?: { name?: string }
  }>(
    "/api/billing/usage",
    (url) => fetch(url).then((r) => r.ok ? r.json() : {}),
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [userMenuOpen])

  const unreadCount = inboxData?.unreadCount ?? 0

  const CORE_NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: t.overview || "Overview", isAi: false },
    { href: "/dashboard/inbox", icon: MessageSquare, label: t.inbox || "Inbox", badge: unreadCount > 0 ? unreadCount : undefined, isAi: false },
    { href: "/dashboard/automations", icon: Zap, label: t.automations || "Automations", isAi: false },
    { href: "/dashboard/ai-engine", icon: Sparkles, label: "AI Agent", isAi: true },
    { href: "/dashboard/contacts", icon: Users, label: t.contacts || "Contacts", isAi: false },
    { href: "/dashboard/broadcasts", icon: Megaphone, label: "Broadcasts", isAi: false },
    { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics", isAi: false },
  ]

  const WORKSPACE_NAV = [
    { href: "/dashboard/connected-platforms", icon: Share2, label: "Channels" },
    { href: "/dashboard/billing", icon: CreditCard, label: t.billingTitle || "Billing" },
    { href: "/dashboard/support", icon: LifeBuoy, label: "Support" },
    { href: "/dashboard/settings", icon: Settings, label: t.settings || "Settings" },
  ]

  const usedReplies = usageData?.usage?.messages_count ?? 0
  const maxReplies = usageData?.usage?.plan_limit || 1000
  const usagePercent = Math.min(Math.round((usedReplies / maxReplies) * 100), 100)
  const planName = usageData?.plan?.name || (plan ? plan.toUpperCase() : "PRO")

  const userInitial = (username || "U").charAt(0).toUpperCase()

  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--s1)] border-e border-[var(--line)] select-none text-[var(--t1)] transition-all",
        collapsed ? "w-[64px] items-center" : "w-[240px]",
        className
      )}
      {...props}
    >
      {/* Brand Header */}
      <div className={cn("pt-4 pb-3 flex items-center", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <BrandLogo variant={collapsed ? "mark" : "wordmark"} size="sm" href="/dashboard" />
        {!collapsed && plan && (
          <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-[4px] bg-[var(--s2)] border border-[var(--line2)] text-[var(--t2)] capitalize">
            {plan.toLowerCase()}
          </span>
        )}
      </div>

      {/* Workspace Switcher */}
      {!collapsed ? (
        <WorkspaceSwitcher />
      ) : (
        <div className="py-1 flex justify-center">
          <div className="size-8 rounded-[8px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-center font-mono text-[11px] font-bold text-[var(--t1)]" title={username}>
            {userInitial}
          </div>
        </div>
      )}

      {/* Search / Jump Row */}
      {!collapsed ? (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              window.dispatchEvent(event)
            }}
            className="w-full h-8 px-2.5 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] text-start flex items-center justify-between text-[12px] text-[var(--t3)] hover:border-[var(--line2)] hover:text-[var(--t2)] transition-colors cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)]"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5 shrink-0" />
              <span>Search or jump to...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded-[4px] bg-[var(--s3)] border border-[var(--line2)] text-[var(--t3)]">
              ⌘K
            </kbd>
          </button>
        </div>
      ) : (
        <div className="py-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
              window.dispatchEvent(event)
            }}
            title="Search (⌘K)"
            aria-label="Search (⌘K)"
            className="size-8 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:border-[var(--line2)] transition-colors cursor-pointer"
          >
            <Search className="size-4 shrink-0" />
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto overflow-x-hidden", collapsed ? "w-full px-2" : "px-2.5 space-y-0.5")}>
        {CORE_NAV.map(({ href, icon: Icon, label, badge, isAi }) => {
          const isAiAgentActive =
            href === "/dashboard/ai-engine" &&
            (pathname.startsWith("/dashboard/ai-engine") ||
              pathname.startsWith("/dashboard/agents"))

          const active =
            isAiAgentActive ||
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href))

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-[6px] text-[13px] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)]",
                collapsed ? "justify-center h-[36px] w-full" : "justify-between h-[32px] px-2.5",
                active
                  ? "bg-[var(--s3)] text-[var(--t1)] font-medium border-s-2 border-s-[var(--gold)]"
                  : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s3)]/60"
              )}
            >
              <span className={cn("flex items-center min-w-0", collapsed ? "justify-center" : "gap-2.5")}>
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active
                      ? isAi || href === "/dashboard"
                        ? "text-[var(--gold)]"
                        : "text-[var(--t1)]"
                      : isAi
                      ? "text-[var(--gold)]/80 group-hover:text-[var(--gold)]"
                      : "text-[var(--t3)] group-hover:text-[var(--t2)]"
                  )}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </span>

              {!collapsed && badge !== undefined && (
                <span className="px-1.5 py-0.5 text-[11px] font-mono rounded-full bg-[var(--s3)] border border-[var(--line2)] text-[var(--t2)]">
                  {badge}
                </span>
              )}
              {collapsed && badge !== undefined && (
                <span className="absolute top-1 end-1 size-2 rounded-full bg-[var(--blue)]" />
              )}
            </Link>
          )
        })}

        {/* WORKSPACE group label */}
        {!collapsed ? (
          <div className="pt-4 pb-1 px-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--t4)]">
              WORKSPACE
            </p>
          </div>
        ) : (
          <div className="my-2 border-t border-[var(--line)]" />
        )}

        {WORKSPACE_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center rounded-[6px] text-[13px] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)]",
                collapsed ? "justify-center h-[36px] w-full" : "gap-2.5 h-[32px] px-2.5",
                active
                  ? "bg-[var(--s3)] text-[var(--t1)] font-medium border-s-2 border-s-[var(--gold)]"
                  : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s3)]/60"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-[var(--t1)]" : "text-[var(--t3)] group-hover:text-[var(--t2)]"
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          )
        })}

        {userRole === "admin" && (
          <>
            {!collapsed ? (
              <div className="pt-4 pb-1 px-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--t4)]">
                  ADMIN
                </p>
              </div>
            ) : (
              <div className="my-2 border-t border-[var(--line)]" />
            )}
            <Link
              href="/dashboard/admin"
              onClick={onNavigate}
              title={collapsed ? "Admin overview" : undefined}
              aria-label={collapsed ? "Admin overview" : undefined}
              className={cn(
                "flex items-center rounded-[6px] text-[13px] transition-colors",
                collapsed ? "justify-center h-[36px] w-full" : "gap-2.5 h-[32px] px-2.5",
                pathname === "/dashboard/admin"
                  ? "bg-[var(--s3)] text-[var(--t1)] font-medium border-s-2 border-s-[var(--gold)]"
                  : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s3)]/60"
              )}
            >
              <Shield className="size-4 shrink-0 text-[var(--t3)]" />
              {!collapsed && <span>Admin overview</span>}
            </Link>
          </>
        )}
      </nav>

      {/* Footer / Usage / User Section */}
      <div className={cn("border-t border-[var(--line)] shrink-0", collapsed ? "p-2 w-full flex flex-col items-center gap-2" : "p-3 space-y-3 w-full")}>
        {!collapsed && (
          <>
            {/* What's new link row */}
            <Link
              href="/dashboard/updates"
              onClick={onNavigate}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-[6px] border border-dashed border-[var(--line2)] text-[12px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors group"
            >
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[var(--gold)] shrink-0" />
                <span>What&apos;s new</span>
              </span>
              <ChevronRight className="size-3 text-[var(--t3)] group-hover:text-[var(--t2)] transition-transform group-hover:translate-x-0.5" />
            </Link>

            {/* Plan Usage Meter */}
            <div className="p-2.5 rounded-[8px] bg-[var(--s2)] border border-[var(--line)] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--t2)]">AI replies</span>
                <span className="font-mono text-[var(--t1)] tabular-nums">
                  {usedReplies.toLocaleString()} / {maxReplies >= 1000 ? `${maxReplies / 1000}k` : maxReplies}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-[var(--s4)] overflow-hidden">
                <div
                  className="h-full bg-[var(--gold)] rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(usagePercent, 2)}%` }}
                />
              </div>
              <p className="text-[10.5px] text-[var(--t3)] truncate">
                {planName} plan
              </p>
            </div>
          </>
        )}

        {/* User Account Row with Popover */}
        <div className={cn("relative", collapsed ? "w-full flex justify-center" : "w-full")} ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User account menu"
            className={cn(
              "rounded-[8px] bg-[var(--s2)] border border-[var(--line)] hover:border-[var(--line2)] transition-colors cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)]",
              collapsed ? "size-9 flex items-center justify-center p-0" : "w-full flex items-center justify-between p-2 text-start"
            )}
          >
            {collapsed ? (
              <div className="size-7 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center overflow-hidden">
                {profilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profilePic} alt={username} className="size-full object-cover" />
                ) : (
                  <span className="text-[11px] font-bold text-[var(--t1)]">{userInitial}</span>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-7 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center shrink-0 overflow-hidden">
                    {profilePic ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profilePic} alt={username} className="size-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-bold text-[var(--t1)]">{userInitial}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[var(--t1)] truncate leading-tight">
                      {username}
                    </p>
                    <p className="text-[10px] text-[var(--t3)] truncate leading-tight mt-0.5">
                      {email || "Workspace admin"}
                    </p>
                  </div>
                </div>
                <MoreHorizontal className="size-3.5 text-[var(--t3)] shrink-0" />
              </>
            )}
          </button>

          {/* User Popover Menu */}
          {userMenuOpen && (
            <div className={cn(
              "absolute bottom-full mb-1.5 z-50 rounded-[8px] bg-[var(--s1)] border border-[var(--line2)] shadow-2xl p-1 space-y-0.5",
              collapsed ? "start-full ms-2 w-48" : "start-0 end-0"
            )}>
              {BRAND.emails.support && (
                <a
                  href={`mailto:${BRAND.emails.support}`}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] text-[12px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <HelpCircle className="size-3.5 text-[var(--t3)]" />
                  <span>Help & support</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setLanguage(language === "ar" ? "en" : "ar")
                  setUserMenuOpen(false)
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-[12px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="size-3.5 text-[var(--t3)]" />
                  <span>Language</span>
                </span>
                <span className="text-[11px] font-medium text-[var(--gold)]">
                  {language === "ar" ? "English" : "عربي"}
                </span>
              </button>

              <div className="h-px bg-[var(--line)] my-1" />

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  if (onLogout) onLogout()
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] text-[12px] text-[var(--red)] hover:bg-[var(--redbg)] transition-colors cursor-pointer"
              >
                <LogOut className="size-3.5 text-[var(--red)]" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}