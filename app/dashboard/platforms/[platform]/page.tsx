"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import {
  Loader2,
  ArrowLeft,
  ExternalLink,
  Zap,
  MessageCircle,
  Activity,
  Users,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Settings,
  BarChart3,
} from "lucide-react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import ConnectPlatformEmptyState from "@/components/dashboard/ConnectPlatformEmptyState"
import TikTokDmSettings from "@/components/dashboard/TikTokDmSettings"
import { toast } from "sonner"
import type { Automation } from "@/lib/types"
import { ChannelBadge } from "@/components/ui/ChannelBadge"

const PLATFORM_CONFIG: Record<string, { name: string; color: string; icon: string; description: string }> = {
  instagram: {
    name: "Instagram",
    color: "pink",
    icon: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
    description: "Automate Instagram Comments and DMs",
  },
  facebook: {
    name: "Facebook",
    color: "blue",
    icon: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
    description: "Automate Facebook Comments and Messenger",
  },
  telegram: {
    name: "Telegram",
    color: "cyan",
    icon: "M17.894 6.844l-2.73 12.836c-.208.92-.75.114-1.127-.156l-3.12-2.302-1.503 1.448c-.166.167-.306.307-.63.307l.223-3.178 5.792-5.234c.252-.224-.055-.348-.39-.124L7.25 15.002 4.167 14.04c-.67-.21-1.077-.45-1.077-.922 0-.472 1.345-1.066 1.76-1.22l12.444-4.8c.582-.225 1.122-.053 1.25.132.128.185.114.58-.088 1.09l-1.084-2.822z",
    description: "Automate Telegram Bot messages",
  },
  whatsapp: {
    name: "WhatsApp",
    color: "green",
    icon: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
    description: "Automate WhatsApp Business",
  },
  tiktok: {
    name: "TikTok",
    color: "zinc",
    icon: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z",
    description: "Keyword DMs, welcome messages, and public comment replies",
  },
  webchat: {
    name: "Website chat",
    color: "amber",
    icon: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z",
    description: "Automate the website chat widget",
  },
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  pink: { bg: "bg-pink-500/10", text: "text-pink-500", border: "border-pink-500/20", badge: "bg-pink-500/10 text-pink-400" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20", badge: "bg-blue-500/10 text-blue-400" },
  cyan: { bg: "bg-[#2AABEE]/10", text: "text-[#2AABEE]", border: "border-[#2AABEE]/20", badge: "bg-[#2AABEE]/10 text-[#2AABEE]" },
  green: { bg: "bg-green-500/10", text: "text-green-500", border: "border-green-500/20", badge: "bg-green-500/10 text-green-400" },
  zinc: { bg: "bg-white/10", text: "text-white", border: "border-white/20", badge: "bg-white/10 text-white" },
  amber: { bg: "bg-[#e5a93c]/10", text: "text-[#e5a93c]", border: "border-[#e5a93c]/20", badge: "bg-[#e5a93c]/10 text-[#e5a93c]" },
}

export default function PlatformDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const platform = params.platform as string
  const { userId, isLoading: isSessionLoading } = useInstagramSession()

  const config = PLATFORM_CONFIG[platform]
  const colors = COLOR_MAP[config?.color || "blue"]

  // Fetch connections
  const { data: connectionsData, isLoading: isConnLoading, mutate: mutateConnections } = useSWR("/api/user/connections", fetcher)
  const connections = connectionsData?.connections || []
  const platformConnections = connections.filter(
    (c: any) => c.platform === platform || (platform === "facebook" && c.platform === "messenger")
  )

  // Deduplicate twin facebook & messenger connections by page_id so business pages aren't shown twice
  const displayedConnections = (function() {
    const map = new Map<string, any>()
    for (const conn of platformConnections) {
      const key = conn.page_id || conn.id
      if (!map.has(key)) {
        map.set(key, { ...conn, platforms: [conn.platform] })
      } else {
        const existing = map.get(key)
        if (!existing.platforms.includes(conn.platform)) {
          existing.platforms.push(conn.platform)
        }
      }
    }
    return Array.from(map.values())
  })()

  const isConnected = displayedConnections.length > 0

  // Fetch automations scoped to this platform
  const { data: automationsData, isLoading: isAutoLoading } = useSWR<Automation[]>(
    userId ? `/api/automations?userId=${userId}` : null,
    fetcher
  )
  const automations = Array.isArray(automationsData) ? automationsData : []
  const platformAutomations = automations.filter((a) => (a.platform || "instagram") === platform)

  // Fetch recent activity and metrics for this specific platform
  const { data: statsData, isLoading: isStatsLoading } = useSWR(
    userId ? `/api/dashboard/stats?userId=${userId}&platform=${platform}` : null,
    fetcher
  )
  const recentActivity = statsData?.recentActivity || []
  const [syncingTemplates, setSyncingTemplates] = useState(false)
  const { data: templateData, mutate: mutateTemplates } = useSWR(
    platform === "whatsapp" ? "/api/whatsapp/templates" : null,
    fetcher
  )
  const templates = templateData?.templates || []

  // Disconnect handler
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDisconnect, setPendingDisconnect] = useState<{ id: string; name: string } | null>(null)

  const handleConfirmDisconnect = async () => {
    if (!pendingDisconnect) return
    const connectionId = pendingDisconnect.id
    const targetName = pendingDisconnect.name
    setDeletingId(connectionId)
    try {
      const res = await fetch(`/api/user/connections?id=${connectionId}`, { method: "DELETE" })
      if (res.ok) {
        toast.success(`Disconnected ${targetName}. Automations stopped.`)
        await mutateConnections()
        if (displayedConnections.length <= 1) {
          router.push("/dashboard/connected-platforms")
        }
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to disconnect")
      }
    } catch (err) {
      console.error("Disconnect failed:", err)
      toast.error("Failed to disconnect")
    } finally {
      setDeletingId(null)
      setPendingDisconnect(null)
    }
  }

  // Loading state
  if (isSessionLoading || isConnLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
      </div>
    )
  }

  // Invalid platform
  if (!config) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Unknown Platform</h2>
          <p className="text-neutral-400 text-sm mb-6">
            &quot;{platform}&quot; is not a supported platform.
          </p>
          <Link
            href="/dashboard/connected-platforms"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Connected Platforms
          </Link>
        </div>
      </div>
    )
  }

  // Not connected — show empty state
  if (!isConnected) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard/connected-platforms"
            className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ChannelBadge channel={platform} size="lg" className="w-10 h-10" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{config.name}</h1>
            <p className="text-neutral-400 text-sm">{config.description}</p>
          </div>
        </div>
        <ConnectPlatformEmptyState description={`You need to connect your ${config.name} account first.`} />
      </div>
    )
  }

  const isLoading = isAutoLoading || isStatsLoading

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/connected-platforms"
            className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <ChannelBadge channel={platform} size="lg" className="w-12 h-12" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{config.name} Dashboard</h1>
              <p className="text-neutral-400 text-sm">{config.description}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/automations?platform=${platform}`}
            className="flex items-center gap-2 px-4 py-2 bg-[#e5a93c] hover:bg-[#d4952b] text-black rounded-lg text-sm font-bold transition-all"
          >
            <Zap className="w-4 h-4" />
            New Rule
          </Link>
        </div>
      </div>

      {/* Connection Details */}
      <div className={`rounded-2xl border ${colors.border} bg-[#0b0b0a] p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            Connected Accounts
          </h2>
          <span className={`text-xs px-2 py-1 rounded-full ${colors.badge}`}>
            {displayedConnections.length} account{displayedConnections.length !== 1 ? "s" : ""}
          </span>
        </div>
        {platform === "whatsapp" && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-medium">Approved templates</p>
              <button
                type="button"
                onClick={async () => {
                  setSyncingTemplates(true)
                  try {
                    const res = await fetch("/api/whatsapp/templates?sync=1")
                    const data = await res.json()
                    if (!res.ok) toast.error(data.error || "Template sync failed")
                    else toast.success("Templates synced")
                    mutateTemplates()
                  } finally {
                    setSyncingTemplates(false)
                  }
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white"
              >
                {syncingTemplates ? "Syncing..." : "Sync from Meta"}
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="text-xs text-neutral-500">No templates stored yet. Sync after the phase 4 migration.</p>
            ) : (
              <ul className="text-xs text-neutral-300 space-y-1">
                {templates.slice(0, 12).map((template: any) => (
                  <li key={`${template.name}-${template.language}`}>
                    {template.name} · {template.language} · {template.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {platform === "tiktok" && (
          <>
            <p className="mt-4 text-xs text-neutral-400 leading-relaxed">
              Keyword and intent replies run on incoming DMs, including tiktok.me ref links. Comments get a public reply. Comment-to-Message DMs stay limited to Vietnam, Indonesia, and Thailand. EEA, Switzerland, and UK accounts cannot send DMs. US accounts need the US review flag.
            </p>
            <TikTokDmSettings />
          </>
        )}
        {platform === "webchat" && (
          <p className="mt-4 text-xs text-neutral-400 leading-relaxed">
            Copy the embed snippet from Connected Platforms. Visitors poll this server. They never receive another visitor&apos;s messages.
          </p>
        )}
        {platform === "telegram" && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Telegram bot automations listen to incoming user messages, commands (e.g. <code>/start</code>, <code>/help</code>), and question keywords. Replies and AI Agent conversations stream instantly via Telegram Webhooks.
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <Link
                href="/dashboard/automations?platform=telegram&intent=telegram_welcome"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
              >
                + Welcome message (/start)
              </Link>
              <Link
                href="/dashboard/automations?platform=telegram&intent=telegram_faq"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
              >
                + FAQ responder
              </Link>
              <Link
                href="/dashboard/ai-engine"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-[#e5a93c]/20 hover:bg-[#e5a93c]/30 text-[#e5a93c] transition-colors"
              >
                Configure AI Agent for Telegram
              </Link>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {displayedConnections.map((conn: any) => (
            <div key={conn.id} className="flex items-center justify-between bg-white/[0.03] p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center ${colors.text}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d={config.icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    {conn.metadata?.username || conn.metadata?.name || conn.page_id}
                  </p>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    {conn.metadata?.is_user_profile
                      ? "Facebook User Profile"
                      : conn.platforms?.length > 1
                      ? "Facebook & Messenger"
                      : conn.platform}{" "}
                    · Connected {conn.connected_at ? new Date(conn.connected_at).toLocaleDateString() : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setPendingDisconnect({
                    id: conn.id,
                    name: conn.metadata?.username || conn.metadata?.name || conn.page_id || config.name,
                  })
                }
                disabled={deletingId === conn.id}
                className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors"
              >
                {deletingId === conn.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Disconnect
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5 bg-[#0b0b0a] border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-[#e5a93c]" />
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Automations</span>
          </div>
          <p className="text-2xl font-bold font-mono text-white">{platformAutomations.length}</p>
        </Card>
        <Card className="p-5 bg-[#0b0b0a] border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Active</span>
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            {platformAutomations.filter((a) => a.is_active).length}
          </p>
        </Card>
        <Card className="p-5 bg-[#0b0b0a] border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Messages</span>
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            {statsData?.metrics?.messagesSent || 0}
          </p>
        </Card>
        <Card className="p-5 bg-[#0b0b0a] border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Audience</span>
          </div>
          <p className="text-2xl font-bold font-mono text-white">
            {statsData?.metrics?.audienceReached || 0}
          </p>
        </Card>
      </div>

      {/* Automations List */}
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0a] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#e5a93c]" />
            {config.name} Automations
          </h2>
          <Link href={`/dashboard/automations?platform=${platform}`} className="text-xs text-[#e5a93c] hover:underline">
            View All →
          </Link>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        ) : platformAutomations.length > 0 ? (
          <div className="space-y-3">
            {platformAutomations.slice(0, 5).map((auto) => (
              <div key={auto.id} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${auto.is_active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-neutral-500"} flex items-center justify-center`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{auto.name || auto.trigger_value || "Untitled Rule"}</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                      {auto.trigger_source} · {auto.trigger_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-1 rounded-full ${auto.is_active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-neutral-500"}`}>
                    {auto.is_active ? "Active" : "Paused"}
                  </span>
                </div>
              </div>
            ))}
            {platformAutomations.length > 5 && (
              <Link href={`/dashboard/automations?platform=${platform}`} className="block text-center text-xs text-neutral-500 hover:text-white py-2 transition-colors">
                + {platformAutomations.length - 5} more
              </Link>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-neutral-500 text-sm mb-3">No automations for {config.name} yet</p>
            <Link
              href={`/dashboard/automations?platform=${platform}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Create First Rule
            </Link>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0a] p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-5">
          <BarChart3 className="w-5 h-5 text-[#e5a93c]" />
          Recent Activity
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        ) : recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.slice(0, 8).map((event: any) => (
              <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#e5a93c]/10 flex items-center justify-center text-[#e5a93c] shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{event.content}</p>
                  <p className="text-[10px] text-neutral-500">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-neutral-500 text-sm">No recent activity for {config.name}</p>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Link href={`/dashboard/automations?platform=${platform}`} className="p-5 rounded-2xl border border-white/10 bg-[#0b0b0a] hover:border-white/20 transition-colors group">
          <Zap className="w-6 h-6 text-neutral-400 group-hover:text-[#e5a93c] mb-3 transition-colors" />
          <p className="text-sm text-white font-medium">Automations</p>
          <p className="text-xs text-neutral-500">Manage rules for {config.name}</p>
        </Link>
        <Link href={`/dashboard/inbox?platform=${platform}`} className="p-5 rounded-2xl border border-white/10 bg-[#0b0b0a] hover:border-white/20 transition-colors group">
          <MessageCircle className="w-6 h-6 text-neutral-400 group-hover:text-[#e5a93c] mb-3 transition-colors" />
          <p className="text-sm text-white font-medium">Inbox</p>
          <p className="text-xs text-neutral-500">View {config.name} conversations</p>
        </Link>
        <Link href="/dashboard/connected-platforms" className="p-5 rounded-2xl border border-white/10 bg-[#0b0b0a] hover:border-white/20 transition-colors group">
          <Settings className="w-6 h-6 text-neutral-400 group-hover:text-[#e5a93c] mb-3 transition-colors" />
          <p className="text-sm text-white font-medium">Settings</p>
          <p className="text-xs text-neutral-500">Manage connections</p>
        </Link>
      </div>

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingDisconnect)}
        onOpenChange={(open) => !open && setPendingDisconnect(null)}
        title={`Disconnect ${pendingDisconnect?.name || config.name}?`}
        description={`Disconnect ${pendingDisconnect?.name || config.name}? Automations on this account will stop immediately and new DMs will not arrive.`}
        confirmLabel="Disconnect account"
        variant="destructive"
        loading={Boolean(deletingId)}
        onConfirm={handleConfirmDisconnect}
      />
    </div>
  )
}
