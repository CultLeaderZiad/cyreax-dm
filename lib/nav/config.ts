import type { LucideIcon } from "lucide-react"
import {
  LayoutGrid,
  Inbox,
  Zap,
  Sparkles,
  Users,
  BarChart3,
  MessageCircle,
  CreditCard,
  SlidersHorizontal,
  Shield,
  Workflow,
  KeyRound,
  Bot,
  FileText,
  Sliders,
  Bell,
  Lock,
  Boxes,
  Palette,
  Layers,
  CalendarClock,
} from "lucide-react"

export type NavItem = {
  id: string
  label: string
  href?: string
  icon?: LucideIcon
  children?: NavItem[]
  badge?: "unread" | string | number
  shortcut?: string[]
  adminOnly?: boolean
  mobileTab?: boolean
}

export const NAV: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/dashboard",
    icon: LayoutGrid,
  },
  {
    id: "inbox",
    label: "Inbox",
    href: "/dashboard/inbox",
    icon: Inbox,
    badge: "unread",
    mobileTab: true,
    shortcut: ["G", "I"],
  },
  {
    id: "automations",
    label: "Automations",
    href: "/dashboard/automations",
    icon: Zap,
    mobileTab: true,
    children: [
      { id: "flows", label: "Flows", href: "/dashboard/flows", icon: Workflow },
      { id: "keywords", label: "Keywords", href: "/dashboard/automations", icon: KeyRound },
      { id: "c2dm", label: "Comment to DM", href: "/dashboard/growth", icon: Zap },
      { id: "broadcasts", label: "Broadcasts", href: "/dashboard/broadcasts", icon: Layers },
    ],
  },
  {
    id: "ai",
    label: "AI Agent",
    href: "/dashboard/ai-engine",
    icon: Sparkles,
    mobileTab: true,
    children: [
      { id: "agents-list", label: "Agents", href: "/dashboard/ai-engine?tab=agents", icon: Bot },
      { id: "knowledge", label: "Knowledge", href: "/dashboard/ai-engine?tab=knowledge", icon: FileText },
      { id: "insights", label: "Insights", href: "/dashboard/ai-engine?tab=insights", icon: Sparkles },
      { id: "logs", label: "Logs", href: "/dashboard/ai", icon: Bot },
    ],
  },
  {
    id: "contacts",
    label: "Contacts",
    href: "/dashboard/contacts",
    icon: Users,
    mobileTab: true,
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    id: "channels",
    label: "Channels",
    href: "/dashboard/connected-platforms",
    icon: MessageCircle,
    children: [
      { id: "all-channels", label: "Overview", href: "/dashboard/connected-platforms" },
      { id: "messenger", label: "Messenger", href: "/dashboard/platforms/facebook" },
      { id: "instagram", label: "Instagram", href: "/dashboard/platforms/instagram" },
      { id: "whatsapp", label: "WhatsApp", href: "/dashboard/platforms/whatsapp" },
      { id: "tiktok", label: "TikTok", href: "/dashboard/platforms/tiktok" },
      { id: "telegram", label: "Telegram", href: "/dashboard/platforms/telegram" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    href: "/dashboard/billing",
    icon: CreditCard,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/dashboard/settings",
    icon: SlidersHorizontal,
    children: [
      { id: "general", label: "General", href: "/dashboard/settings", icon: Sliders },
      { id: "billing", label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { id: "appearance", label: "Appearance", href: "/dashboard/settings/appearance", icon: Palette },
      { id: "notifications", label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
      { id: "security", label: "Security", href: "/dashboard/settings/security", icon: Lock },
      { id: "integrations", label: "Integrations", href: "/dashboard/integrations", icon: Boxes },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Shield,
    adminOnly: true,
    children: [
      { id: "users", label: "Users", href: "/dashboard/admin" },
      { id: "plans", label: "Plans", href: "/dashboard/admin/plans" },
      { id: "trials", label: "Trials", href: "/dashboard/admin/enterprise" },
    ],
  },
]

/**
 * Filter items by user role.
 * adminOnly items are displayed only if role === 'admin'.
 */
export function filterNavByRole(items: NavItem[], role?: string | null): NavItem[] {
  const isAdmin = role === "admin"
  return items
    .filter((item) => (item.adminOnly ? isAdmin : true))
    .map((item) => ({
      ...item,
      children: item.children ? filterNavByRole(item.children, role) : undefined,
    }))
}
