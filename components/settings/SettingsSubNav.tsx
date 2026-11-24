"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useInstagramSession } from "@/hooks/use-instagram-session"

interface SubNavItem {
  id: string
  label: string
  href: string
}

interface SubNavGroup {
  adminOnly?: boolean
  title: string
  items: SubNavItem[]
}

const navGroups: SubNavGroup[] = [
  {
    title: "ACCOUNT",
    items: [
      { id: "profile", label: "Profile", href: "/dashboard/settings/profile" },
      { id: "notifications", label: "Notifications", href: "/dashboard/settings/notifications" },
      { id: "security", label: "Security", href: "/dashboard/settings/security" },
    ],
  },
  {
    title: "AGENCY",
    items: [
      { id: "team", label: "Team & roles", href: "/dashboard/settings/team" },
      { id: "white-label", label: "White-label", href: "/dashboard/settings/white-label" },
      { id: "client-portal", label: "Client portal", href: "/dashboard/settings/client-portal" },
      { id: "workspaces", label: "Client workspaces", href: "/dashboard/settings/workspaces" },
    ],
  },
  {
    adminOnly: true,
    title: "PLATFORM",
    items: [{ id: "announcements", label: "Announcements", href: "/dashboard/settings/announcements" }],
  },
  {
    title: "DEVELOPERS",
    items: [
      { id: "api-keys", label: "API keys", href: "/dashboard/settings/api-keys" },
      { id: "webhooks", label: "Webhooks", href: "/dashboard/settings/webhooks" },
      { id: "audit-log", label: "Audit log", href: "/dashboard/settings/audit-log" },
    ],
  },
]

export function SettingsSubNav() {
  const pathname = usePathname()
  const { role } = useInstagramSession()

  // Determine current active section
  const currentSection = pathname === "/dashboard/settings"
    ? "team"
    : pathname.replace("/dashboard/settings/", "")

  return (
    <nav
      aria-label="Settings"
      className="w-full md:w-[210px] shrink-0 border-b md:border-b-0 md:border-r border-[var(--line)] py-5 px-3 select-none space-y-5 overflow-y-auto"
    >
      {navGroups.filter((group) => !group.adminOnly || role === "admin").map((group) => (
        <div key={group.title} className="space-y-1">
          <span className="block px-2.5 text-[10.5px] font-mono uppercase tracking-wider text-[var(--t3)] font-medium">
            {group.title}
          </span>
          <div className="space-y-0.5 pt-0.5">
            {group.items.map((item) => {
              const isActive =
                currentSection === item.id ||
                pathname === item.href ||
                (item.id === "team" && pathname === "/dashboard/settings")

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "h-[32px] px-2.5 rounded-[6px] flex items-center text-[12.5px] font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-[var(--s3)] text-[var(--t1)] font-semibold"
                      : "text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
