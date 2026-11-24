"use client"

import { useDateRange } from "@/hooks/use-date-range"
import { parseRange } from "@/lib/analytics/period"
import * as React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Bell, Plus, FileText, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/brand"

interface TopBarProps {
  workspaceName?: string
  actions?: React.ReactNode
  className?: string
}

const routeTitleMap: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/inbox": "Inbox",
  "/dashboard/automations": "Automations",
  "/dashboard/ai-engine": "AI Agent",
  "/dashboard/contacts": "Contacts",
  "/dashboard/broadcasts": "Broadcasts",
  "/dashboard/analytics": "Analytics",
  "/dashboard/connected-platforms": "Channels",
  "/dashboard/billing": "Billing",
  "/dashboard/settings": "Settings",
  "/dashboard/updates": "Updates",
  "/dashboard/admin": "Admin",
  "/dashboard/admin/plans": "Plans",
  "/dashboard/admin/onboarding": "Onboarding",
  "/dashboard/admin/payments": "Payments",
  "/dashboard/admin/support": "Support inbox",
  "/dashboard/admin/enterprise": "Enterprise inquiries",
  "/dashboard/admin/campaigns": "Campaigns",
  "/dashboard/admin/campaigns/create": "New campaign",
  "/dashboard/admin/agents": "Agents catalog",
  "/dashboard/growth": "Growth",
  "/dashboard/growth-agent": "Growth Agent",
  "/dashboard/usage": "Usage",
  "/dashboard/flows": "Flows",
  "/dashboard/agents": "Agents",
  "/dashboard/agency": "Agency",
  "/dashboard/ai": "AI logs",
  "/dashboard/catalog": "Catalog",
  "/dashboard/ice-breakers": "Ice breakers",
  "/dashboard/integrations": "Integrations",
  "/dashboard/platforms": "Channels",
  "/dashboard/support": "Support",
}

const settingsSectionMap: Record<string, string> = {
  "": "Team & white-label",
  "team": "Team & white-label",
  "profile": "Profile",
  "notifications": "Notifications",
  "security": "Security",
  "white-label": "White-label",
  "client-portal": "Client portal",
  "workspaces": "Client workspaces",
  "api-keys": "API keys",
  "webhooks": "Webhooks",
  "audit-log": "Audit log",
  "announcements": "Announcements",
  "appearance": "Appearance",
}

export function TopBar({
  workspaceName = "Workspace",
  actions,
  className,
}: TopBarProps) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [range, setRange] = useDateRange()
  const [currency, setCurrency] = React.useState<"EGP" | "SAR" | "USD">("EGP")

  const isSettings = pathname.startsWith("/dashboard/settings")
  let settingsSection = ""
  if (isSettings) {
    const rawSection = pathname.replace("/dashboard/settings", "").replace(/^\//, "")
    settingsSection = settingsSectionMap[rawSection] || "Team & white-label"
  }

  // Match the page title
  const pageTitle =
    routeTitleMap[pathname] ||
    Object.entries(routeTitleMap).find(([path]) => path !== "/dashboard" && pathname.startsWith(path))?.[1] ||
    "Dashboard"

  return (
    <header
      className={cn(
        "h-[52px] border-b border-[var(--line)] bg-[var(--bg)] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none",
        className
      )}
    >
      {/* Breadcrumb: Client / Page [/ Section] */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12.5px] min-w-0">
        <span className="text-[var(--t2)] font-normal truncate max-w-[140px] sm:max-w-[200px]">
          {workspaceName}
        </span>
        <span className="text-[var(--t3)]">/</span>
        {isSettings ? (
          <>
            <Link
              href="/dashboard/settings/team"
              className="text-[var(--t2)] hover:text-[var(--t1)] transition-colors"
            >
              Settings
            </Link>
            <span className="text-[var(--t3)]">/</span>
            <span className="text-[var(--t1)] font-semibold truncate">
              {settingsSection}
            </span>
          </>
        ) : (
          <span className="text-[var(--t1)] font-semibold truncate">
            {pageTitle}
          </span>
        )}
      </nav>

      {/* Page Actions on inline-end */}
      <div className="flex items-center gap-2.5 shrink-0">
        {actions ? (
          actions
        ) : isSettings ? (
          <a
            href={`mailto:${brand.supportEmail}`}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--t2)] hover:text-[var(--t1)] px-2.5 py-1.5 rounded-[6px] hover:bg-[var(--s2)] transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[var(--t3)]" />
            <span>Contact support</span>
          </a>
        ) : pathname === "/dashboard/billing" ? (
          <div className="flex items-center gap-3">
            {/* Currency Segmented Control */}
            <div className="flex items-center p-0.5 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] text-[11px] font-mono">
              {(["EGP", "SAR", "USD"] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => {
                    setCurrency(curr)
                    window.dispatchEvent(
                      new CustomEvent("cyreax:currency-change", { detail: curr })
                    )
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer",
                    currency === curr
                      ? "bg-[var(--s3)] text-[var(--t1)]"
                      : "text-[var(--t3)] hover:text-[var(--t2)]"
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("cyreax:open-invoices"))
              }}
              className="h-[30px] px-3 text-[12px] font-medium gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--t3)]" />
              <span>Invoices</span>
            </Button>
          </div>
        ) : (
          <>
            {/* Date range of the overview cards (the analytics page has its own) */}
            {pathname === "/dashboard" && (
              <SegmentedControl
                size="sm"
                value={range}
                onChange={(value) => setRange(parseRange(value))}
                options={[
                  { value: "today", label: "Today" },
                  { value: "7d", label: "7 days" },
                  { value: "30d", label: "30 days" },
                ]}
              />
            )}

            {/* Notification bell */}
            <Link
              href="/dashboard/updates"
              aria-label="Updates and notifications"
              className="size-[26px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] hover:bg-[var(--s3)] text-[var(--t2)] hover:text-[var(--t1)] flex items-center justify-center transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)]"
            >
              <Bell className="size-3.5" />
            </Link>

            {/* New automation CTA */}
            <Button asChild size="sm" variant="primary">
              <Link href="/dashboard/automations">
                <Plus className="size-3.5" />
                <span>New automation</span>
              </Link>
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
