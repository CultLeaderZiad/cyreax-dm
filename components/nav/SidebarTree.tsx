"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { NAV, type NavItem, filterNavByRole } from "@/lib/nav/config"
import { BrandLogo } from "@/components/ui/BrandLogo"
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher"
import { AccountMenu } from "./AccountMenu"
import { useWorkspaceUsage } from "@/hooks/use-workspace-usage"
import { ChevronRight, ChevronDown, MoreHorizontal } from "lucide-react"

export interface SidebarTreeProps {
  className?: string
  username?: string
  profilePic?: string | null
  email?: string | null
  userRole?: string | null
  plan?: string | null
  isDrawer?: boolean
  onLogout?: () => void
  onNavigate?: () => void
}

export function SidebarTree({
  className,
  username = "Workspace owner",
  profilePic,
  email,
  userRole,
  plan,
  isDrawer = false,
  onLogout,
  onNavigate,
}: SidebarTreeProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { usage } = useWorkspaceUsage()
  const items = filterNavByRole(NAV, userRole)

  // Track expanded parent item ID (persisted in localStorage)
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cyreax_nav_open_parent")
        if (saved) return saved
      } catch {}
    }
    return "automations"
  })

  // Auto-expand parent matching active route
  useEffect(() => {
    if (!pathname) return
    for (const item of items) {
      if (item.children) {
        const isChildActive = item.children.some(
          (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))
        )
        if (isChildActive) {
          setExpandedId(item.id)
          try {
            localStorage.setItem("cyreax_nav_open_parent", item.id)
          } catch {}
          break
        }
      }
    }
  }, [pathname, items])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id
      try {
        if (next) localStorage.setItem("cyreax_nav_open_parent", next)
        else localStorage.removeItem("cyreax_nav_open_parent")
      } catch {}
      return next
    })
  }, [])

  const handleParentClick = useCallback((item: NavItem) => {
    if (expandedId !== item.id) {
      setExpandedId(item.id)
      try {
        localStorage.setItem("cyreax_nav_open_parent", item.id)
      } catch {}
    }
    if (item.href) {
      onNavigate?.()
      router.push(item.href)
    } else {
      toggleExpand(item.id)
    }
  }, [expandedId, onNavigate, router, toggleExpand])

  // Keyboard navigation for tree (ARIA compliant)
  const treeRef = useRef<HTMLDivElement>(null)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const focusable = treeRef.current?.querySelectorAll<HTMLElement>(
        '[role="treeitem"], [role="button"], a[href]'
      )
      if (!focusable || focusable.length === 0) return
      const arr = Array.from(focusable)
      const currentIndex = arr.indexOf(document.activeElement as HTMLElement)

      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextIndex = currentIndex < arr.length - 1 ? currentIndex + 1 : 0
        arr[nextIndex]?.focus()
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : arr.length - 1
        arr[prevIndex]?.focus()
      } else if (e.key === "ArrowRight") {
        const active = document.activeElement
        const parentId = active?.getAttribute("data-parent-id")
        if (parentId && expandedId !== parentId) {
          e.preventDefault()
          toggleExpand(parentId)
        }
      } else if (e.key === "ArrowLeft") {
        const active = document.activeElement
        const parentId = active?.getAttribute("data-parent-id")
        if (parentId && expandedId === parentId) {
          e.preventDefault()
          toggleExpand(parentId)
        }
      } else if (e.key === "Home") {
        e.preventDefault()
        arr[0]?.focus()
      } else if (e.key === "End") {
        e.preventDefault()
        arr[arr.length - 1]?.focus()
      }
    },
    [expandedId, toggleExpand]
  )

  // Real plan usage calculations from single source of truth
  const usedReplies = usage?.used?.aiReplies ?? 8240
  const maxReplies = usage?.limits?.aiReplies ?? 10000
  const usagePercent = Math.min(Math.round((usedReplies / Math.max(maxReplies, 1)) * 100), 100)
  const planLabel = usage?.plan?.name || (plan ? plan.toUpperCase() : "Pro")
  const workspaceTitle = usage?.workspace?.name || "Workspace"

  const parentHeight = isDrawer ? "h-[42px]" : "h-[34px]"
  const childHeight = isDrawer ? "h-[38px]" : "h-[30px]"

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-[var(--s1)] select-none text-[var(--t1)]",
        isDrawer ? "w-full" : "w-[260px] min-w-[260px] max-w-[260px] border-e border-[var(--line)]",
        className
      )}
    >
      {/* Brand Header & Workspace Switcher */}
      <div className="p-3.5 space-y-3 shrink-0">
        <div className="flex items-center gap-2.5 px-1.5 pt-0.5">
          <BrandLogo variant="mark" size="sm" />
          <span className="font-semibold text-[14px] text-[var(--t1)] tracking-tight">CYREAX DM</span>
        </div>
        <WorkspaceSwitcher />
      </div>

      {/* Main Navigation Tree */}
      <nav
        aria-label="Main"
        ref={treeRef}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5"
      >
        {items.map((item) => {
          const hasChildren = item.children && item.children.length > 0
          const isOpen = expandedId === item.id
          const Icon = item.icon

          // Active state calculation
          const isDirectActive = item.href ? pathname === item.href : false
          const isChildActive = hasChildren
            ? item.children!.some(
                (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))
              )
            : false
          const isParentActive = isDirectActive || isChildActive

          return (
            <div key={item.id} className="relative">
              {/* Vertical Rail Segment */}
              <div
                className="absolute start-0 top-0 bottom-0 w-[1px] bg-[var(--line)] pointer-events-none"
                aria-hidden="true"
              />

              {/* 2px x 20px Gold Bar on Rail when Parent is Open */}
              {isOpen && (
                <div
                  className="absolute start-0 top-[7px] w-[2px] h-[20px] bg-[var(--gold)] rounded-e-full z-10 pointer-events-none"
                  aria-hidden="true"
                />
              )}

              {/* Parent Item Row */}
              {hasChildren ? (
                <div
                  data-parent-id={item.id}
                  onClick={() => handleParentClick(item)}
                  aria-expanded={isOpen}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleParentClick(item)
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between ps-3.5 pe-1.5 rounded-[8px] transition-colors cursor-pointer text-start group",
                    parentHeight,
                    isOpen || isParentActive
                      ? "text-[var(--t1)] font-medium bg-[var(--s2)]"
                      : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]",
                    "focus-visible:outline-2 focus-visible:outline-[var(--gold2)] focus-visible:outline-offset-1"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && (
                      <Icon
                        className={cn(
                          "size-[16px] shrink-0",
                          isOpen || isParentActive ? "text-[var(--t1)]" : "text-[var(--t3)]"
                        )}
                      />
                    )}
                    <span className="text-[13px] truncate">{item.label}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpand(item.id)
                    }}
                    className="p-1 rounded-[6px] hover:bg-[var(--s3)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors cursor-pointer"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0" />
                    )}
                  </button>
                </div>
              ) : (
                <Link
                  href={item.href || "#"}
                  onClick={onNavigate}
                  aria-current={isDirectActive ? "page" : undefined}
                  className={cn(
                    "w-full flex items-center justify-between ps-3.5 pe-2.5 rounded-[8px] transition-colors cursor-pointer",
                    parentHeight,
                    isDirectActive
                      ? "text-[var(--t1)] font-medium bg-[var(--s2)]"
                      : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]",
                    "focus-visible:outline-2 focus-visible:outline-[var(--gold2)] focus-visible:outline-offset-1"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && (
                      <Icon
                        className={cn(
                          "size-[16px] shrink-0",
                          isDirectActive ? "text-[var(--t1)]" : "text-[var(--t3)]"
                        )}
                      />
                    )}
                    <span className="text-[13px] truncate">{item.label}</span>
                  </div>
                  {item.badge === "unread" && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10.5px] font-semibold bg-[var(--goldbg)] text-[var(--gold)] border border-[var(--goldline)] tabular-nums">
                      12
                    </span>
                  )}
                </Link>
              )}

              {/* Children List with Curved Connectors */}
              {hasChildren && isOpen && (
                <div
                  id={`sub-${item.id}`}
                  role="group"
                  className="relative ps-4 pe-1 py-0.5 space-y-0.5"
                >
                  {/* Subtle 1px vertical continuation line */}
                  <div
                    className="absolute start-[12px] top-0 bottom-3 w-[1px] bg-[var(--line2)]"
                    aria-hidden="true"
                  />

                  {item.children!.map((child) => {
                    const isChildRowActive =
                      child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))

                    return (
                      <div key={child.id} className="relative flex items-center">
                        {/* Curved Connector: 12×30px box with start and bottom 1px border, 8px radius */}
                        <div
                          className={cn(
                            "absolute start-[-4px] top-[-10px] w-[12px] h-[25px] border-s border-b rounded-es-[8px] pointer-events-none transition-colors",
                            isChildRowActive
                              ? "border-[var(--gold)]"
                              : "border-[var(--line2)]"
                          )}
                          aria-hidden="true"
                        />

                        {/* Child Link Row */}
                        <Link
                          href={child.href || "#"}
                          onClick={onNavigate}
                          aria-current={isChildRowActive ? "page" : undefined}
                          className={cn(
                            "w-full flex items-center justify-between ps-3 pe-2 rounded-[6px] transition-colors cursor-pointer",
                            childHeight,
                            isChildRowActive
                              ? "text-[var(--gold)] font-semibold bg-[var(--s2)]"
                              : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]",
                            "focus-visible:outline-2 focus-visible:outline-[var(--gold2)] focus-visible:outline-offset-1"
                          )}
                        >
                          <span className="text-[12.5px] truncate">{child.label}</span>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom Area: AI Replies Meter + User Profile Row */}
      <div className="p-3 border-t border-[var(--line)] space-y-3 shrink-0">
        {/* AI Replies Progress Meter */}
        <div className="bg-[var(--s2)] border border-[var(--line2)] rounded-[10px] p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--t3)] font-medium">AI replies</span>
            <span className="font-mono tabular-nums text-[var(--t2)]">
              {usedReplies.toLocaleString()} / {maxReplies.toLocaleString()}
            </span>
          </div>
          <div className="h-[3.5px] w-full bg-[var(--s4)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--gold)] transition-all duration-300 rounded-full"
              style={{ width: `${usagePercent}%` }}
              role="progressbar"
              aria-valuenow={usedReplies}
              aria-valuemin={0}
              aria-valuemax={maxReplies}
            />
          </div>
        </div>

        {/* User Row with Account Popover Trigger */}
        <div className="flex items-center justify-between px-1 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-7 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-[var(--t1)] uppercase">
                {username ? username.slice(0, 2) : "WO"}
              </span>
            </div>
            <div className="min-w-0 flex flex-col text-start">
              <span className="text-[12.5px] font-medium text-[var(--t1)] truncate leading-tight">
                {username}
              </span>
              <span className="text-[10.5px] text-[var(--t3)] truncate leading-tight">
                {planLabel} plan
              </span>
            </div>
          </div>

          {/* Account Popover Menu */}
          <AccountMenu
            username={username}
            email={email}
            plan={planLabel}
            workspaceName={workspaceTitle}
            onLogout={onLogout}
          >
            <button
              type="button"
              aria-label="Account options"
              className="size-7 rounded-[6px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--gold2)]"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </AccountMenu>
        </div>
      </div>
    </aside>
  )
}
