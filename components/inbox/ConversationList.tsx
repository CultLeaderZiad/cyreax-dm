"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { Search, SlidersHorizontal, ChevronDown, Check, Clock, Sparkles, MessageSquare, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/types/db"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { ConversationListSkeleton } from "@/components/ui/DashboardSkeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { Pill } from "@/components/ui/Pill"
import { Tag } from "@/components/ui/Tag"
import { displayName } from "@/lib/ui/contactName"
import { formatMessagePreview } from "@/lib/ui/eventLabels"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { MobileNav } from "@/components/layout/mobile-nav"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConversationContextMenu } from "@/components/nav"

interface ConversationListProps {
  userId: string
  selectedId: string | null
  onSelect: (id: string, username: string, recipientId: string, platform: string) => void
}

type TabFilter = "open" | "needs_human" | "mine" | "unassigned" | "ai"

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return "now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function getInitials(name: string): string {
  if (!name) return "?"
  const cleaned = name.replace(/[@_.]+/g, " ").trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function ConversationList({ userId, selectedId, onSelect }: ConversationListProps) {
  const { language } = useLanguage()
  const isAr = language === "ar"
  const { username, profilePic, email, role, logout } = useInstagramSession()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabFilter>("open")

  const { data, isLoading: loading } = useSWR(
    userId ? `/api/inbox/conversations?userId=${userId}` : null,
    fetcher
  )
  const rawConversations: Conversation[] = Array.isArray(data) ? data : []

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return rawConversations.filter((c) => {
      // Channel filter
      if (selectedChannel !== "all") {
        const plat = (c.platform || "instagram").toLowerCase()
        if (plat !== selectedChannel.toLowerCase()) return false
      }
      // Tab filter
      if (activeTab === "needs_human" && !c.bot_paused) return false
      if (activeTab === "mine" && (c as any).assigned_to !== userId) return false
      if (activeTab === "unassigned" && (c as any).assigned_to) return false
      if (activeTab === "ai" && !(c as any).ai_handled && (c as any).status !== "ai") return false
      if (activeTab === "open" && ((c as any).is_archived || (c as any).status === "closed")) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchUser = c.recipient_username?.toLowerCase().includes(q)
        const matchPreview = c.last_message_preview?.toLowerCase().includes(q)
        if (!matchUser && !matchPreview) return false
      }
      return true
    })
  }, [rawConversations, selectedChannel, searchQuery, activeTab, userId])

  // Computed tab counts from real conversations
  const counts = useMemo(() => {
    const open = rawConversations.filter((c: any) => !c.is_archived && c.status !== "closed").length
    const needsHuman = rawConversations.filter((c: any) => Boolean(c.bot_paused)).length
    const mine = rawConversations.filter((c: any) => c.assigned_to === userId).length
    const unassigned = rawConversations.filter((c: any) => !c.assigned_to).length
    const ai = rawConversations.filter((c: any) => c.ai_handled || c.status === "ai").length
    return {
      open,
      needsHuman,
      mine,
      unassigned,
      ai,
    }
  }, [rawConversations, userId])

  // Auto-select first conversation on desktop load if available
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768 && !selectedId) {
      if (filteredConversations.length > 0) {
        const first = filteredConversations[0]
        onSelect(
          first.id,
          first.recipient_username,
          first.recipient_id ? first.recipient_id.toString() : first.id,
          first.platform || "instagram"
        )
      }
    }
  }, [filteredConversations, selectedId, onSelect])

  // Keyboard navigation (J / K)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        if (filteredConversations.length === 0) return
        const currentIndex = filteredConversations.findIndex((c) => c.id === selectedId)
        const nextIndex = currentIndex < filteredConversations.length - 1 ? currentIndex + 1 : 0
        const nextConv = filteredConversations[nextIndex]
        if (nextConv) {
          onSelect(
            nextConv.id,
            nextConv.recipient_username,
            nextConv.recipient_id.toString(),
            nextConv.platform || "instagram"
          )
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        if (filteredConversations.length === 0) return
        const currentIndex = filteredConversations.findIndex((c) => c.id === selectedId)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredConversations.length - 1
        const prevConv = filteredConversations[prevIndex]
        if (prevConv) {
          onSelect(
            prevConv.id,
            prevConv.recipient_username,
            prevConv.recipient_id.toString(),
            prevConv.platform || "instagram"
          )
        }
      } else if (e.key === "Enter") {
        if (filteredConversations.length === 0) return
        const currentConv = filteredConversations.find((c) => c.id === selectedId) || filteredConversations[0]
        if (currentConv) {
          onSelect(
            currentConv.id,
            currentConv.recipient_username,
            currentConv.recipient_id.toString(),
            currentConv.platform || "instagram"
          )
        }
      }
    },
    [filteredConversations, selectedId, onSelect]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const channelOptions: { value: string; label: string; channel?: ChannelType }[] = [
    { value: "all", label: isAr ? "جميع القنوات" : "All channels" },
    { value: "instagram", label: "Instagram", channel: "instagram" },
    { value: "whatsapp", label: "WhatsApp", channel: "whatsapp" },
    { value: "messenger", label: "Messenger", channel: "messenger" },
    { value: "tiktok", label: "TikTok", channel: "tiktok" },
    { value: "telegram", label: "Telegram", channel: "telegram" },
  ]

  const activeChannelLabel =
    channelOptions.find((c) => c.value === selectedChannel)?.label || (isAr ? "جميع القنوات" : "All channels")

  if (loading) {
    return (
      <div className="flex flex-col h-full border-e border-[var(--line)] bg-[var(--bg)] w-full md:w-[300px] shrink-0">
        <div className="p-3.5 border-b border-[var(--line)] space-y-3">
          <div className="h-5 w-24 rounded bg-[var(--s2)] animate-pulse" />
          <div className="h-8 w-full rounded-[6px] bg-[var(--s2)] animate-pulse" />
          <div className="h-6 w-full rounded-[6px] bg-[var(--s2)] animate-pulse" />
        </div>
        <ConversationListSkeleton />
      </div>
    )
  }

  const displayItems = filteredConversations

  return (
    <div className="flex flex-col h-full border-e border-[var(--line)] bg-[var(--bg)] w-full md:w-[300px] shrink-0 select-none overflow-hidden">
      {/* 56px Sticky Header */}
      <div className="h-[56px] px-3 md:px-3.5 border-b border-[var(--line)] flex items-center justify-between shrink-0 bg-[var(--bg)] z-10 sticky top-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile hamburger menu (opens MobileNav sidebar) */}
          <div className="md:hidden">
            <MobileNav
              username={username || "Creator"}
              profilePic={profilePic}
              email={email}
              userRole={role}
              onLogout={logout}
            />
          </div>
          <h2 className="text-[16px] font-semibold text-[var(--t1)] tracking-tight truncate">
            {isAr ? "صندوق الوارد" : "Inbox"}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Filter icon button with 44px min touch target on mobile */}
          <button
            type="button"
            aria-label={isAr ? "تصفية" : "Filter conversations"}
            className="size-11 md:size-[28px] rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[var(--t2)] hover:text-[var(--t1)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="size-4 md:size-3.5 text-[var(--t3)]" />
          </button>

          {/* Channel Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setChannelMenuOpen(!channelMenuOpen)}
              className="h-11 md:h-[28px] px-2.5 rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[12px] md:text-[11.5px] font-medium text-[var(--t2)] hover:text-[var(--t1)] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Filter by channel"
            >
              <span className="truncate max-w-[85px]">{activeChannelLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--t3)]" />
            </button>

            {channelMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setChannelMenuOpen(false)}
                />
                <div className="absolute end-0 top-full mt-1 w-44 rounded-lg border border-[var(--line)] bg-[var(--s2)] shadow-xl p-1 z-40">
                  {channelOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSelectedChannel(opt.value)
                        setChannelMenuOpen(false)
                      }}
                      className={cn(
                        "w-full text-start px-2.5 py-2 md:py-1.5 rounded-[5px] text-[12px] flex items-center justify-between transition-colors cursor-pointer",
                        selectedChannel === opt.value
                          ? "bg-[var(--s3)] text-[var(--t1)] font-medium"
                          : "text-[var(--t2)] hover:bg-[var(--s3)] hover:text-[var(--t1)]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {opt.channel ? (
                          <ChannelBadge channel={opt.channel} size="sm" className="w-4 h-4" />
                        ) : (
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--t3)]" />
                        )}
                        <span>{opt.label}</span>
                      </div>
                      {selectedChannel === opt.value && (
                        <Check className="w-3.5 h-3.5 text-[var(--gold)]" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search and Tabs sub-header */}
      <div className="p-3 border-b border-[var(--line)] flex flex-col gap-2.5 shrink-0 bg-[var(--bg)]">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-3.5 md:h-3.5 text-[var(--t3)] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 md:h-[32px] bg-[var(--s2)] border border-[var(--line)] rounded-[8px] md:rounded-[6px] ps-9 pe-8 text-[13px] md:text-[12px] text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:border-[var(--line2)] focus:bg-[var(--s3)] transition-colors"
            placeholder={isAr ? "بحث بالاسم، الرسالة، الوسم..." : "Search name, message, tag…"}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[var(--t3)] hover:text-[var(--t1)] cursor-pointer p-1"
            >
              <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
          )}
        </div>

        {/* Horizontally scrollable segmented control tabs / filter chips */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--s2)] border border-[var(--line)] rounded-[8px] overflow-x-auto no-scrollbar text-[12px]">
          {[
            { id: "open", label: isAr ? "مفتوح" : "Open", count: counts.open },
            { id: "needs_human", label: isAr ? "تدخل بشري" : "Needs human", count: counts.needsHuman },
            { id: "mine", label: isAr ? "خاص بي" : "Mine", count: counts.mine },
            { id: "unassigned", label: isAr ? "غير معين" : "Unassigned", count: counts.unassigned },
            { id: "ai", label: isAr ? "الذكاء الاصطناعي" : "AI handling", count: counts.ai },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabFilter)}
                className={cn(
                  "px-3 py-1.5 md:py-1 rounded-[6px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[32px]",
                  isActive
                    ? "bg-[var(--s3)] text-[var(--t1)] shadow-xs"
                    : "text-[var(--t3)] hover:text-[var(--t2)] hover:bg-[var(--s3)]/50"
                )}
              >
                <span>{tab.label}</span>
                <span className={cn(
                  "font-mono text-[10.5px] px-1 rounded-full",
                  isActive ? "bg-[var(--line2)] text-[var(--t1)]" : "text-[var(--t4)]"
                )}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversations List with .fade-b */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto divide-y divide-[var(--line)] fade-b scrollbar-thin scrollbar-thumb-[var(--line2)] scrollbar-track-transparent"
      >
        {displayItems.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={MessageSquare}
              title={searchQuery ? "No matching conversations" : "No conversations yet"}
              description={
                searchQuery
                  ? `No chats found for "${searchQuery}".`
                  : "Conversations appear here when someone DMs or comments on a connected channel."
              }
              compact
            />
          </div>
        ) : (
          displayItems.map((conv, idx) => {
            const isSelected = selectedId === conv.id
            const rawPlatform = conv.platform || "instagram"
            const platform = rawPlatform === "facebook" ? "messenger" : rawPlatform.toLowerCase()

            const contactName = displayName(
              {
                recipient_username: conv.recipient_username,
                recipient_id: conv.recipient_id,
                platform: conv.platform,
              },
              isAr ? "ar" : "en"
            )

            const initials = getInitials(contactName)
            const timeStr = formatRelativeTime(conv.last_message_at || conv.created_at)
            const previewText = formatMessagePreview(conv.last_message_preview, isAr ? "ar" : "en")

            // Real conversation status badges
            const hasUnread = Boolean((conv as any).unread_count && (conv as any).unread_count > 0)
            const isAiHandling = Boolean((conv as any).ai_handled || (conv as any).status === "ai")
            const isBotPaused = Boolean((conv as any).bot_paused)
            const tags = Array.isArray((conv as any).tags) ? (conv as any).tags : []
            const assignedTo = (conv as any).assigned_to === userId ? "Assigned to you" : (conv as any).assigned_to_name

            return (
              <ConversationContextMenu
                key={conv.id}
                conversationId={conv.id}
                contactName={contactName}
                onReply={() =>
                  onSelect(
                    conv.id,
                    contactName,
                    conv.recipient_id ? conv.recipient_id.toString() : conv.id,
                    conv.platform || "instagram"
                  )
                }
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() =>
                    onSelect(
                      conv.id,
                      contactName,
                      conv.recipient_id ? conv.recipient_id.toString() : conv.id,
                      conv.platform || "instagram"
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect(
                        conv.id,
                        contactName,
                        conv.recipient_id ? conv.recipient_id.toString() : conv.id,
                        conv.platform || "instagram"
                      )
                    }
                  }}
                  className={cn(
                    "p-3 flex items-start gap-3 transition-colors cursor-pointer relative group focus:outline-none focus-visible:bg-[var(--s3)] min-h-[56px]",
                    isSelected
                      ? "bg-[var(--s2)] before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-[var(--gold)]"
                      : "hover:bg-[var(--s3)]"
                  )}
                >
                  {/* 36px Avatar with 14px ChannelBadge */}
                  <div className="relative shrink-0">
                    <div className="size-9 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[11px] font-semibold text-[var(--t2)] group-hover:text-[var(--t1)] transition-colors">
                      {initials}
                    </div>
                    <div className="absolute -bottom-0.5 -end-0.5">
                      <ChannelBadge channel={platform} size="sm" className="size-3.5 rounded-full border border-[var(--bg)]" />
                    </div>
                  </div>

                  {/* Info Container */}
                  <div className="flex-1 min-w-0">
                    {/* Top Line: Name & Time */}
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className={cn(
                            "text-[13px] font-semibold truncate transition-colors",
                            isSelected ? "text-[var(--t1)]" : "text-[var(--t1)] group-hover:text-white"
                          )}
                        >
                          {contactName}
                        </span>
                        {hasUnread && (
                          <span className="size-2 rounded-full bg-[var(--blue)] shrink-0 inline-block" />
                        )}
                      </span>
                      <span className="font-mono text-[10.5px] text-[var(--t3)] shrink-0">
                        {timeStr}
                      </span>
                    </div>

                    {/* Middle Line: Message Preview */}
                    <p
                      dir="auto"
                      className="text-[12px] text-[var(--t3)] line-clamp-1 leading-snug mb-1.5"
                    >
                      {previewText}
                    </p>

                    {/* Bottom Line: Real Meta Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isAiHandling && (
                        <Pill variant="green" icon={<Sparkles className="w-2.5 h-2.5" />}>
                          AI active
                        </Pill>
                      )}
                      {isBotPaused && (
                        <Pill variant="amber">
                          {isAr ? "تدخل بشري" : "Needs human"}
                        </Pill>
                      )}
                      {assignedTo && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded-[4px] bg-[var(--s3)] border border-[var(--line2)] text-[var(--t2)] font-mono">
                          {assignedTo}
                        </span>
                      )}
                      {tags.map((t: string) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </ConversationContextMenu>
            )

          })
        )}
      </div>
    </div>
  )
}
