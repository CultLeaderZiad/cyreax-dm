"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Inbox,
  Zap,
  Sparkles,
  Users,
  MoreHorizontal,
  X,
  BarChart3,
  MessageCircle,
  Shield,
  CreditCard,
  LogOut,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import { SlideMenu, SETTINGS_SLIDE_ITEMS, type SlideMenuItem } from "./SlideMenu"

export interface MobileTabBarProps {
  className?: string
  unreadCount?: number
  username?: string
  email?: string | null
  plan?: string | null
  userRole?: string | null
  onLogout?: () => void
}

export function MobileTabBar({
  className,
  unreadCount = 0,
  username = "Workspace owner",
  email,
  plan = "Pro",
  userRole,
  onLogout,
}: MobileTabBarProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // 5 primary tabs
  const TABS = [
    { id: "inbox", label: "Inbox", href: "/dashboard/inbox", icon: Inbox, badge: unreadCount },
    { id: "automations", label: "Automations", href: "/dashboard/automations", icon: Zap },
    { id: "ai", label: "AI", href: "/dashboard/ai-engine", icon: Sparkles },
    { id: "contacts", label: "Contacts", href: "/dashboard/contacts", icon: Users },
  ]

  // Construct items for More menu
  const moreMenuItems: SlideMenuItem[] = [
    ...SETTINGS_SLIDE_ITEMS,
    {
      id: "analytics",
      label: "Analytics",
      icon: BarChart3,
      href: "/dashboard/analytics",
    },
    {
      id: "channels",
      label: "Channels",
      icon: MessageCircle,
      href: "/dashboard/connected-platforms",
      children: [
        { id: "whatsapp", label: "WhatsApp", href: "/dashboard/platforms/whatsapp" },
        { id: "instagram", label: "Instagram", href: "/dashboard/platforms/instagram" },
        { id: "messenger", label: "Messenger", href: "/dashboard/platforms/facebook" },
        { id: "tiktok", label: "TikTok", href: "/dashboard/platforms/tiktok" },
        { id: "telegram", label: "Telegram", href: "/dashboard/platforms/telegram" },
      ],
    },
    ...(userRole === "admin"
      ? [
          {
            id: "admin",
            label: "Admin",
            icon: Shield,
            children: [
              { id: "users", label: "Users", href: "/dashboard/admin" },
              { id: "plans", label: "Plans", href: "/dashboard/admin/plans" },
              { id: "trials", label: "Trials", href: "/dashboard/admin/enterprise" },
            ],
          },
        ]
      : []),
    {
      id: "logout",
      label: "Sign out",
      icon: LogOut,
      isDestructive: true,
      onClick: () => {
        if (onLogout) onLogout()
        else window.location.href = "/api/auth/logout"
      },
    },
  ]

  return (
    <>
      <nav
        aria-label="Mobile navigation tab bar"
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--s1)] border-t border-[var(--line)] flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom,0px)] select-none",
          className
        )}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + "/")

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "relative flex-1 min-h-[49px] h-[49px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer",
                isActive ? "text-[var(--gold)]" : "text-[var(--t3)] hover:text-[var(--t1)]"
              )}
            >
              {/* 2px Gold Top Bar on Active Tab */}
              {isActive && (
                <div
                  className="absolute top-0 w-[24px] h-[2px] bg-[var(--gold)] rounded-full"
                  aria-hidden="true"
                />
              )}

              <div className="relative">
                <Icon className="size-[20px]" />
                {tab.id === "inbox" && typeof tab.badge === "number" && tab.badge > 0 && (
                  <span className="absolute -top-1 -end-2 size-4 rounded-full bg-[var(--gold)] text-black text-[9.5px] font-bold flex items-center justify-center tabular-nums">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}

        {/* More Tab */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "relative flex-1 min-h-[49px] h-[49px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer",
            moreOpen ? "text-[var(--gold)]" : "text-[var(--t3)] hover:text-[var(--t1)]"
          )}
        >
          {moreOpen && (
            <div
              className="absolute top-0 w-[24px] h-[2px] bg-[var(--gold)] rounded-full"
              aria-hidden="true"
            />
          )}
          <MoreHorizontal className="size-[20px]" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>

      {/* More SlideMenu Sheet */}
      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 animate-in fade-in-0 duration-140" />
          <Dialog.Content className="fixed bottom-0 inset-x-0 z-50 max-h-[85vh] bg-[var(--s1)] border-t border-[var(--line)] rounded-t-[24px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] overflow-y-auto animate-in slide-in-from-bottom duration-140 focus:outline-none">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center text-[11.5px] font-semibold text-[var(--t1)]">
                  {username ? username.slice(0, 2).toUpperCase() : "WO"}
                </div>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[var(--t1)] leading-tight">
                    {username}
                  </h3>
                  <p className="text-[11px] text-[var(--t3)] leading-tight">{plan} plan</p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="size-7 rounded-[8px] bg-[var(--s2)] hover:bg-[var(--s3)] text-[var(--t3)] hover:text-[var(--t1)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex justify-center">
              <SlideMenu
                items={moreMenuItems}
                title="Navigation & Settings"
                className="w-full max-w-[400px] border-0 shadow-none bg-transparent p-0"
                onClose={() => setMoreOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
