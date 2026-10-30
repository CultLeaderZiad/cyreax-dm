"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"
import {
  User,
  LayoutGrid,
  Sun,
  Moon,
  Monitor,
  Sliders,
  HelpCircle,
  LogOut,
  ChevronRight,
  Bell,
} from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

export interface AccountMenuProps {
  children: React.ReactNode
  username?: string
  email?: string | null
  plan?: string | null
  workspaceName?: string
  onLogout?: () => void
}

export function AccountMenu({
  children,
  username = "Workspace owner",
  email,
  plan = "Pro",
  workspaceName = "Workspace",
  onLogout,
}: AccountMenuProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { data: notifData } = useSWR<{ unread_count: number }>("/api/notifications", fetcher, {
    refreshInterval: 30000,
  })
  const unreadCount = notifData?.unread_count ?? 0

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = () => {
    if (onLogout) {
      onLogout()
    } else {
      window.location.href = "/api/auth/logout"
    }
  }

  const initials = username
    ? username
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "WO"

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={8}
          className="z-50 w-[240px] bg-[var(--s1)] border border-[var(--line)] rounded-[20px] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.6)] text-[var(--t1)] select-none focus:outline-none animate-in fade-in-50 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-120"
        >
          {/* Header Card */}
          <div className="flex items-center gap-3 px-2 py-2 mb-1 rounded-[12px] bg-[var(--s2)]">
            <div className="size-8 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center shrink-0">
              <span className="text-[11.5px] font-semibold text-[var(--t1)] uppercase">
                {initials}
              </span>
            </div>
            <div className="min-w-0 flex flex-col text-start">
              <span className="text-[13px] font-semibold text-[var(--t1)] truncate leading-tight">
                {username}
              </span>
              <span className="text-[11px] text-[var(--t3)] truncate leading-tight">
                {plan} plan · {workspaceName}
              </span>
            </div>
          </div>

          {/* Profile */}
          <DropdownMenu.Item
            onSelect={() => router.push("/dashboard/settings/profile")}
            className="h-[40px] rounded-[12px] px-3 flex items-center justify-between text-[13px] text-[var(--t1)] hover:bg-[var(--s3)] focus:bg-[var(--s3)] focus:outline-none cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <User className="size-[17px] text-[var(--t2)]" />
              <span>Profile</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--t3)]">⇧⌘P</span>
          </DropdownMenu.Item>

          {/* Switch Workspace */}
          <DropdownMenu.Item
            onSelect={() => router.push("/dashboard/settings/workspaces")}
            className="h-[40px] rounded-[12px] px-3 flex items-center justify-between text-[13px] text-[var(--t1)] hover:bg-[var(--s3)] focus:bg-[var(--s3)] focus:outline-none cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="size-[17px] text-[var(--t2)]" />
              <span>Switch workspace</span>
            </div>
            <ChevronRight className="size-4 text-[var(--t3)]" />
          </DropdownMenu.Item>

          {/* Notifications */}
          <DropdownMenu.Item
            onSelect={() => router.push("/dashboard/inbox")}
            className="h-[40px] rounded-[12px] px-3 flex items-center justify-between text-[13px] text-[var(--t1)] hover:bg-[var(--s3)] focus:bg-[var(--s3)] focus:outline-none cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Bell className="size-[17px] text-[var(--t2)]" />
              <span>Notifications</span>
            </div>
            {unreadCount > 0 ? (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-mono font-bold flex items-center justify-center tabular-nums leading-none">
                {unreadCount}
              </span>
            ) : null}
          </DropdownMenu.Item>

          {/* Theme Toggle (Light / Dark / System) */}
          <div className="px-2 py-1.5 rounded-[12px] my-0.5">
            <div className="flex items-center justify-between px-1 mb-1.5 text-xs text-[var(--t2)] font-medium">
              <span>Theme</span>
              <span className="text-[11px] font-mono text-[var(--t3)] capitalize">
                {mounted ? theme : "system"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-[8px] bg-[var(--s2)] border border-[var(--line)]">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-[6px] text-xs font-medium transition-colors cursor-pointer",
                  mounted && theme === "light"
                    ? "bg-[var(--gold)] text-black font-semibold shadow-xs"
                    : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
                )}
                title="Light mode"
                aria-label="Light mode"
              >
                <Sun className="size-3.5" />
                <span className="text-[11px]">Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-[6px] text-xs font-medium transition-colors cursor-pointer",
                  mounted && theme === "dark"
                    ? "bg-[var(--gold)] text-black font-semibold shadow-xs"
                    : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
                )}
                title="Dark mode"
                aria-label="Dark mode"
              >
                <Moon className="size-3.5" />
                <span className="text-[11px]">Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-[6px] text-xs font-medium transition-colors cursor-pointer",
                  mounted && theme === "system"
                    ? "bg-[var(--gold)] text-black font-semibold shadow-xs"
                    : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
                )}
                title="System theme"
                aria-label="System theme"
              >
                <Monitor className="size-3.5" />
                <span className="text-[11px]">System</span>
              </button>
            </div>
          </div>

          {/* Settings */}
          <DropdownMenu.Item
            onSelect={() => router.push("/dashboard/settings")}
            className="h-[40px] rounded-[12px] px-3 flex items-center justify-between text-[13px] text-[var(--t1)] hover:bg-[var(--s3)] focus:bg-[var(--s3)] focus:outline-none cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Sliders className="size-[17px] text-[var(--t2)]" />
              <span>Settings</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--t3)]">⌘,</span>
          </DropdownMenu.Item>

          {/* Help & docs */}
          <DropdownMenu.Item
            onSelect={() => router.push("/faq")}
            className="h-[40px] rounded-[12px] px-3 flex items-center justify-between text-[13px] text-[var(--t1)] hover:bg-[var(--s3)] focus:bg-[var(--s3)] focus:outline-none cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <HelpCircle className="size-[17px] text-[var(--t2)]" />
              <span>Help & docs</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--t3)]">?</span>
          </DropdownMenu.Item>

          {/* 1px Separator */}
          <DropdownMenu.Separator className="h-[1px] bg-[var(--line)] my-1.5" />

          {/* Sign out */}
          <DropdownMenu.Item
            onSelect={handleSignOut}
            className="h-[40px] rounded-[12px] px-3 flex items-center gap-2.5 text-[13px] text-[var(--red)] hover:bg-[var(--redbg)] focus:bg-[var(--redbg)] focus:outline-none cursor-pointer transition-colors"
          >
            <LogOut className="size-[17px] text-[var(--red)]" />
            <span className="font-medium">Sign out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
