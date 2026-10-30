"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import {
  Send,
  Loader2,
  ChevronLeft,
  MessageSquare,
  Clock,
  Sparkles,
  Paperclip,
  Smile,
  ShoppingCart,
  Zap,
  Check,
  CheckCheck,
  Bot,
  User,
  X,
  Package,
  Info,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { Tag } from "@/components/ui/Tag"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { cn } from "@/lib/utils"
import type { Message } from "@/types/db"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { toast } from "sonner"
import { displayName as getDisplayName } from "@/lib/ui/contactName"
import { getWindowCountdown } from "@/lib/ui/eventLabels"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface ChatWindowProps {
  conversationId: string | null
  recipientId?: string
  recipientName: string | null
  platform?: string
  userId: string
  onBack?: () => void
  contactContext?: any
  mutateContact?: () => void
  onInsertTextIntoComposer?: (text: string) => void
  onOpenContextRail?: () => void
}

const PLATFORM_THEMES: Record<
  string,
  {
    name: string
    badge: ChannelType
    color: string
    subtitle: string
    placeholder: string
    focusBorder: string
    sendBg: string
    sendText: string
  }
> = {
  instagram: {
    name: "Instagram",
    badge: "instagram",
    color: "#E1306C",
    subtitle: "Instagram DM · 24h Meta Window",
    placeholder: "Reply on Instagram DM…",
    focusBorder: "focus-within:border-pink-500/40",
    sendBg: "bg-[var(--t1)] text-[#09090B]",
    sendText: "text-[#09090B]",
  },
  whatsapp: {
    name: "WhatsApp",
    badge: "whatsapp",
    color: "#25D366",
    subtitle: "WhatsApp Business · Cloud API",
    placeholder: "Reply on WhatsApp…",
    focusBorder: "focus-within:border-emerald-500/40",
    sendBg: "bg-[#25D366] text-[#09090B]",
    sendText: "text-[#09090B]",
  },
  telegram: {
    name: "Telegram",
    badge: "telegram",
    color: "#229ED9",
    subtitle: "Telegram Bot Direct · Real-time",
    placeholder: "Send Telegram message (supports Markdown)…",
    focusBorder: "focus-within:border-cyan-500/40",
    sendBg: "bg-[#229ED9] text-white",
    sendText: "text-white",
  },
  facebook: {
    name: "Messenger",
    badge: "messenger",
    color: "#0084FF",
    subtitle: "Facebook Messenger · Page conversation",
    placeholder: "Reply on Messenger…",
    focusBorder: "focus-within:border-blue-500/40",
    sendBg: "bg-[#0084FF] text-white",
    sendText: "text-white",
  },
  messenger: {
    name: "Messenger",
    badge: "messenger",
    color: "#0084FF",
    subtitle: "Facebook Messenger · Page conversation",
    placeholder: "Reply on Messenger…",
    focusBorder: "focus-within:border-blue-500/40",
    sendBg: "bg-[#0084FF] text-white",
    sendText: "text-white",
  },
  tiktok: {
    name: "TikTok",
    badge: "tiktok",
    color: "#FE2C55",
    subtitle: "TikTok Business Messaging",
    placeholder: "Reply on TikTok…",
    focusBorder: "focus-within:border-rose-500/40",
    sendBg: "bg-[var(--t1)] text-[#09090B]",
    sendText: "text-[#09090B]",
  },
  webchat: {
    name: "WebChat",
    badge: "webchat",
    color: "#F5A623",
    subtitle: "Website Live Visitor Session",
    placeholder: "Reply to website visitor…",
    focusBorder: "focus-within:border-amber-500/40",
    sendBg: "bg-[var(--gold)] text-black",
    sendText: "text-black",
  },
}

function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text)
}

function formatMsgTime(dateStr: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function ChatWindow({
  conversationId,
  recipientId,
  recipientName,
  platform = "instagram",
  userId,
  onBack,
  contactContext: externalContactContext,
  mutateContact: externalMutateContact,
  onInsertTextIntoComposer,
  onOpenContextRail,
}: ChatWindowProps) {
  const { language } = useLanguage()
  const isAr = language === "ar"

  const channel = platform === "facebook" ? "messenger" : platform.toLowerCase()
  const platformKey = channel || "instagram"
  const platformTheme = PLATFORM_THEMES[platformKey] || PLATFORM_THEMES.instagram

  // Real messages query
  const {
    data: messagesData,
    mutate: mutateMessages,
    isLoading: loading,
    error: messagesError,
  } = useSWR(
    conversationId
      ? `/api/inbox/messages?conversationId=${conversationId}`
      : null,
    fetcher
  )
  const messages: Message[] = Array.isArray(messagesData) ? messagesData : []

  // Automations query for quick snippets
  const { data: automationsData } = useSWR(
    userId ? `/api/automations?userId=${userId}` : null,
    fetcher
  )
  const automations = Array.isArray(automationsData) ? automationsData : []

  // Contact context query (if not passed from parent)
  const { data: fetchedContactContext, mutate: internalMutateContact } = useSWR(
    !externalContactContext && recipientId
      ? `/api/contacts?externalId=${encodeURIComponent(recipientId)}&channel=${encodeURIComponent(
          channel
        )}&conversationId=${encodeURIComponent(conversationId || "")}`
      : null,
    fetcher
  )
  const contactContext = externalContactContext || fetchedContactContext
  const mutateContact = externalMutateContact || internalMutateContact

  const windowStatus = contactContext?.window?.status as string | undefined
  const [internalBotPaused, setInternalBotPaused] = useState<boolean>(false)
  const botPaused =
    contactContext?.contact?.bot_paused !== undefined
      ? Boolean(contactContext?.contact?.bot_paused)
      : internalBotPaused

  const whatsappClosed = channel === "whatsapp" && windowStatus === "closed"

  const { data: templateData } = useSWR(whatsappClosed ? "/api/whatsapp/templates" : null, fetcher)
  const templates = (templateData?.templates || []).filter(
    (template: any) => template.status === "APPROVED" || !template.status
  )

  const [inputText, setInputText] = useState("")
  const [lastFailedText, setLastFailedText] = useState("")
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const [isAutomationOpen, setIsAutomationOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateLanguage, setTemplateLanguage] = useState("")
  const [templateParams, setTemplateParams] = useState("")
  const [copilotDismissed, setCopilotDismissed] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom helper
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    setHasNewMessages(false)
  }

  // Initial scroll to bottom on mount or conversation change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as any })
    setCopilotDismissed(false)
    setHasNewMessages(false)
    setIsAtBottom(true)
  }, [conversationId])

  // Track user scroll position to avoid breaking manual browsing
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 64
    setIsAtBottom(atBottom)
    if (atBottom) {
      setHasNewMessages(false)
    }
  }

  // Realtime Supabase subscription
  useEffect(() => {
    if (!conversationId) return

    const supabase = getSupabaseBrowserClient()
    const realtimeChannel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          mutateMessages((prev: Message[] = []) => {
            const exists = prev.find(
              (m) =>
                m.id === newMsg.id ||
                (m.content === newMsg.content &&
                  (m.direction === "out" || !m.is_from_instagram) &&
                  m.id.toString().startsWith("temp_"))
            )
            if (exists) {
              return prev.map((m) => (m.id === exists.id ? newMsg : m))
            }
            return [...prev, newMsg]
          }, false)

          if (isAtBottom) {
            setTimeout(scrollToBottom, 50)
          } else {
            setHasNewMessages(true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(realtimeChannel)
    }
  }, [conversationId, mutateMessages, isAtBottom])

  // Visual viewport handling so virtual keyboard on mobile doesn't obscure the composer
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    const handleViewportResize = () => {
      if (isAtBottom) {
        bottomRef.current?.scrollIntoView({ behavior: "instant" as any })
      }
    }

    window.visualViewport.addEventListener("resize", handleViewportResize)
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize)
    }
  }, [isAtBottom])

  // Send message handler
  const handleSendMessage = async (text: string = inputText) => {
    if (!text.trim() || !recipientId || !userId || !conversationId) return

    setSending(true)
    setSendError("")
    setLastFailedText(text)
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          recipientId,
          conversationId,
          channel,
          message: text,
        }),
      })

      if (res.ok) {
        setInputText("")
        setLastFailedText("")
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
        }
        const newMsg: Message = {
          id: `temp_${Date.now()}`,
          conversation_id: conversationId!,
          user_id: userId,
          sender_id: "me",
          sender_username: "Me",
          content: text,
          is_from_instagram: false,
          direction: "out",
          created_at: new Date().toISOString(),
        }
        mutateMessages((prev: any) => [...(prev || []), newMsg], false)
        setTimeout(scrollToBottom, 50)
      } else {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error || "Message was not sent")
      }
    } catch (e) {
      console.error("Send failed", e)
      setSendError("Network error. Please try again.")
    } finally {
      setSending(false)
      setIsAutomationOpen(false)
    }
  }

  // Handle textarea text change and auto-growing height up to 5 lines (~120px)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    const target = e.target
    target.style.height = "auto"
    const newHeight = Math.min(target.scrollHeight, 120)
    target.style.height = `${Math.max(newHeight, 44)}px`
  }

  // Insert suggested text into composer
  const handleInsertSuggestion = (text: string) => {
    setInputText(text)
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = "auto"
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120)
      textareaRef.current.style.height = `${Math.max(newHeight, 44)}px`
    }
    if (onInsertTextIntoComposer) {
      onInsertTextIntoComposer(text)
    }
  }

  // Rewrite in Egyptian Dialect
  const handleRewriteInEgyptian = () => {
    if (!inputText.trim()) {
      toast.info("Type a response first to polish in Egyptian dialect")
      return
    }
    let rewritten = inputText
      .replace(/أهلاً وسهلاً بك/g, "أهلاً بيك يا فندم")
      .replace(/كيف يمكنني مساعدتك/g, "أقدر أساعدك في إيه؟")
      .replace(/بالتأكيد/g, "أكيد يا فندم من عيونا")
      .replace(/هذا/g, "ده")
      .replace(/هذه/g, "دي")
      .replace(/ما هو/g, "إيه هو")
      .replace(/سوف/g, "هنـ")
      .replace(/شكراً جزيلاً/g, "تسلم وتحت أمرك في أي وقت")

    if (rewritten === inputText) {
      rewritten = `تمام يا فندم، ${inputText} ويوصلك في أسرع وقت إن شاء الله!`
    }
    setInputText(rewritten)
    toast.success("Rewritten in friendly Egyptian dialect")
  }

  // Toggle Bot Pause / Resume
  const handleToggleBot = async () => {
    const nextState = !botPaused
    setInternalBotPaused(nextState)

    const contactId = contactContext?.contact?.id
    if (contactId) {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_paused: nextState }),
      }).catch(() => {})
    } else if (recipientId) {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          externalId: recipientId,
          displayName: recipientName,
          bot_paused: nextState,
        }),
      }).catch(() => {})
    }
    if (mutateContact) mutateContact()
    toast.success(nextState ? "AI Agent paused for this contact" : "AI Agent resumed")
  }

  // HOOKS MUST RUN UNCONDITIONALLY BEFORE ANY RETURN STATEMENT (Fixes React Error #310)
  const resolvedDisplayName = useMemo(() => {
    if (!recipientName && !recipientId) return "Customer"
    return getDisplayName(
      {
        display_name: recipientName,
        recipient_id: recipientId,
        platform: channel,
      },
      isAr ? "ar" : "en"
    )
  }, [recipientName, recipientId, channel, isAr])

  const initials = resolvedDisplayName
    .replace(/[@_.]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "C"

  // 24h Meta window countdown
  const lastInboundMsg = useMemo(() => {
    return [...messages].reverse().find((m) => m.direction === "in" || m.is_from_instagram)
  }, [messages])

  const countdown = useMemo(() => {
    if (channel === "telegram" || channel === "webchat") {
      return { formatted: "Direct messaging", isClosed: false, isWarning: false, hours: 24, minutes: 0 }
    }
    if (windowStatus === "closed") {
      return { formatted: "Window closed", isClosed: true, isWarning: false, hours: 0, minutes: 0 }
    }
    const lastTime =
      contactContext?.window?.last_inbound_at ||
      lastInboundMsg?.created_at ||
      null
    if (!lastTime) {
      return { formatted: "24h Window active", isClosed: false, isWarning: false, hours: 24, minutes: 0 }
    }
    return getWindowCountdown(lastTime)
  }, [windowStatus, contactContext?.window?.last_inbound_at, lastInboundMsg?.created_at, channel])

  // Copilot suggestions
  const copilotSuggestion = useMemo(() => {
    if (copilotDismissed || !contactContext?.suggestion) return null
    return contactContext.suggestion
  }, [copilotDismissed, contactContext?.suggestion])

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3.5 text-center bg-[var(--bg)] h-full p-6 select-none">
        <div className="w-12 h-12 rounded-xl bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t3)]">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="max-w-xs">
          <h3 className="text-sm font-semibold text-[var(--t1)] mb-1">Select a conversation</h3>
          <p className="text-xs text-[var(--t3)] leading-relaxed">
            Choose a thread from the inbox to read, copilot draft, or resolve live.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-[100dvh] md:h-full bg-[var(--bg)] overflow-hidden relative">
      {/* 1. Header (56px sticky, --bg, bottom border) matching 08-mobile-inbox.png */}
      <div className="h-[56px] border-b border-[var(--line)] px-2.5 sm:px-4 flex items-center justify-between bg-[var(--bg)] shrink-0 z-20 sticky top-0">
        {/* Left: Back chevron + 40px Avatar + Name & Subtitle */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={isAr ? "الرجوع إلى صندوق الوارد" : "Back to inbox"}
              className="w-11 h-11 -ms-1 rounded-[6px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
          )}

          {/* Contact Tap Area: opens contact/copilot sheet */}
          <button
            type="button"
            onClick={onOpenContextRail}
            className="flex items-center gap-2.5 min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer group"
          >
            {/* 40px Avatar */}
            <div className="relative shrink-0">
              <div className="size-10 rounded-full border border-[var(--line2)] bg-[var(--s3)] text-[var(--t1)] flex items-center justify-center font-mono text-[13px] font-semibold">
                {initials}
              </div>
            </div>

            {/* Name + Second Line (Channel + Timer) */}
            <div className="min-w-0">
              <h1 className="text-[16px] font-semibold text-[var(--t1)] truncate leading-tight group-hover:text-white">
                {resolvedDisplayName}
              </h1>
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--t3)] leading-tight mt-0.5">
                <ChannelBadge
                  channel={platformTheme.badge}
                  size="sm"
                  className="size-3.5 rounded-full shrink-0"
                />
                <span className="truncate">
                  {platformTheme.name}
                  {" · "}
                  <span
                    className={
                      countdown.isClosed
                        ? "text-[var(--red)]"
                        : countdown.isWarning
                        ? "text-[var(--amber)]"
                        : "text-[var(--t3)]"
                    }
                  >
                    {countdown.formatted}
                  </span>
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Right: Status Pill inline-end (gold-outline "AI paused" / "AI handling" / "Resolved") */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleBot}
            aria-label={botPaused ? "Resume AI Agent" : "Pause AI Agent"}
            className={cn(
              "h-[28px] px-3 rounded-full text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1 leading-none",
              botPaused
                ? "border border-[var(--goldline)] bg-[var(--goldbg)]/40 text-[var(--gold)] hover:bg-[var(--goldbg)]"
                : "border border-[var(--gold)] bg-[var(--gold)] text-[#09090B] hover:opacity-90"
            )}
          >
            <span>{botPaused ? "AI paused" : "AI handling"}</span>
          </button>

          {/* Desktop Resolve Button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => toast.success("Conversation marked as resolved")}
            className="hidden md:inline-flex h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Resolve</span>
          </Button>

          {/* Desktop/Tablet Context Rail button */}
          {onOpenContextRail && (
            <button
              type="button"
              onClick={onOpenContextRail}
              aria-label="Conversation context"
              className="hidden sm:flex lg:hidden w-8 h-8 rounded-[6px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] items-center justify-center transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 scrollbar-thin scrollbar-thumb-[var(--line2)] scrollbar-track-transparent"
      >
        {loading ? (
          /* Skeleton bubbles on loading */
          <div className="space-y-4 py-3 animate-pulse">
            <div className="flex flex-col items-start max-w-[82%] space-y-1.5">
              <div className="h-3 w-20 rounded bg-[var(--s3)]" />
              <div className="h-12 w-56 rounded-2xl rounded-tl-xs bg-[var(--s3)] border border-[var(--line)]" />
            </div>
            <div className="flex flex-col items-end ms-auto max-w-[82%] space-y-1.5">
              <div className="h-3 w-24 rounded bg-[var(--goldbg)]" />
              <div className="h-16 w-64 rounded-2xl rounded-tr-xs bg-[var(--goldbg)] border border-[var(--goldline)]" />
            </div>
            <div className="flex flex-col items-start max-w-[82%] space-y-1.5">
              <div className="h-3 w-16 rounded bg-[var(--s3)]" />
              <div className="h-10 w-48 rounded-2xl rounded-tl-xs bg-[var(--s3)] border border-[var(--line)]" />
            </div>
          </div>
        ) : messagesError ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="text-[13px] text-[var(--red)]">Couldn't load this conversation.</p>
            <button
              type="button"
              onClick={() => mutateMessages()}
              className="px-3.5 py-1.5 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] text-[12px] text-[var(--t1)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          /* Real authentic empty conversation state for the selected platform */
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center select-none my-auto">
            <div className="size-14 rounded-full bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-center font-mono text-base font-semibold text-[var(--t1)] mb-3 relative">
              {initials}
              <div className="absolute -bottom-1 -end-1">
                <ChannelBadge channel={platformTheme.badge} size="sm" className="size-4 rounded-full border border-[var(--bg)]" />
              </div>
            </div>
            <h4 className="text-[14px] font-semibold text-[var(--t1)]">
              {resolvedDisplayName}
            </h4>
            <p className="text-[12px] text-[var(--t3)] mt-0.5 flex items-center gap-1.5 justify-center">
              <span>{platformTheme.name}</span>
              <span>·</span>
              <span>{platformTheme.subtitle}</span>
            </p>
            <div className="mt-4 px-3.5 py-2 rounded-full bg-[var(--s2)] border border-[var(--line)] text-[11.5px] text-[var(--t3)] max-w-sm">
              No messages exchanged yet in this conversation. Type a message below to start chatting.
            </div>
          </div>
        ) : (
          /* Render loaded real database messages */
          messages.map((msg) => {
            const isMe = msg.direction ? msg.direction === "out" : !msg.is_from_instagram
            const isAi =
              (msg as any).is_ai_agent ||
              (msg.sender_username && msg.sender_username.toLowerCase().includes("ai"))
            const timeStr = formatMsgTime(msg.created_at)
            const isArabic = isArabicText(msg.content)

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col",
                  isMe ? "items-end ms-auto" : "items-start",
                  "max-w-[82%]"
                )}
              >
                <span className="font-mono text-[11px] text-[var(--t3)] mb-1 px-1">
                  {isAi
                    ? `AI Agent ${timeStr ? `· ${timeStr}` : ""}`
                    : isMe
                    ? `${(msg as any).sender_username || "You"} ${timeStr ? `· ${timeStr}` : ""}`
                    : `${resolvedDisplayName} ${timeStr ? `· ${timeStr}` : ""}`}
                </span>
                <div
                  dir={isArabic ? "rtl" : "auto"}
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-[15px] leading-[1.6] border break-words",
                    isArabic && "font-arabic",
                    isAi
                      ? "rounded-tr-xs bg-[var(--goldbg)] text-[var(--t1)] border-[var(--goldline)]"
                      : isMe
                      ? "rounded-tr-xs bg-[var(--bubble-out)] text-[var(--t1)] border-[#2B3042]"
                      : "rounded-tl-xs bg-[var(--s3)] text-[var(--t1)] border-[var(--line)]"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating "New messages ↓" pill */}
      {hasNewMessages && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-[var(--s3)] border border-[var(--goldline)] text-[var(--gold)] text-[12px] font-medium shadow-xl hover:bg-[var(--s4)] flex items-center gap-1.5 transition-all animate-bounce cursor-pointer"
        >
          <span>New messages ↓</span>
        </button>
      )}

      {/* 3. Copilot Card pinned above composer matching 08-mobile-inbox.png */}
      {copilotSuggestion && (
        <div className="mx-3.5 mb-2.5 p-3 rounded-[12px] bg-[var(--s1)] border border-[var(--goldline)] shrink-0 z-20 shadow-lg relative">
          {/* Card Header: ✦ Copilot · {intent} + Dismiss X */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[12.5px] truncate">
              <span className="text-[var(--gold)] font-medium flex items-center gap-1 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Copilot</span>
              </span>
              <span className="text-[var(--t3)] truncate">· {copilotSuggestion.intent}</span>
            </div>

            <button
              type="button"
              onClick={() => setCopilotDismissed(true)}
              aria-label="Dismiss suggestion"
              className="w-11 h-11 -my-2.5 -me-2.5 rounded-full text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Suggestion Bubble inside (--s2, RTL, tap inserts into composer) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleInsertSuggestion(copilotSuggestion.text)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleInsertSuggestion(copilotSuggestion.text)
              }
            }}
            dir="rtl"
            className="mt-2.5 p-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-[14px] sm:text-[15px] leading-[1.6] text-[var(--t1)] font-arabic cursor-pointer hover:bg-[var(--s3)] transition-colors active:scale-[0.99] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            title="Tap to insert suggestion into reply box"
          >
            {copilotSuggestion.text}
          </div>
        </div>
      )}

      {/* Quick Automations Popup */}
      {isAutomationOpen && (
        <div className="absolute bottom-24 start-4 end-4 md:left-auto md:right-4 md:w-80 bg-[var(--s2)] border border-[var(--line)] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 text-[11px] font-mono text-[var(--t3)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--line)] mb-1">
            <span className="flex items-center gap-1.5 text-[var(--gold)]">
              <Zap className="w-3 h-3" /> Quick Automations
            </span>
            <button
              type="button"
              onClick={() => setIsAutomationOpen(false)}
              className="hover:text-[var(--t1)]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 p-1 scrollbar-thin scrollbar-thumb-[var(--line2)]">
            {automations.map((auto: any) => (
              <button
                key={auto.id}
                type="button"
                onClick={() => {
                  handleInsertSuggestion(auto.response_content?.message || auto.name)
                  setIsAutomationOpen(false)
                }}
                className="w-full text-start px-2.5 py-2 rounded-[6px] hover:bg-[var(--s3)] text-[12px] text-[var(--t1)] transition-colors flex items-center gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
                <span className="truncate flex-1">{auto.name}</span>
              </button>
            ))}
            {automations.length === 0 && (
              <div className="px-3 py-4 text-center text-[var(--t3)] text-xs">
                No automations configured yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Composer pinned to bottom with env(safe-area-inset-bottom) ≥ 26px */}
      <div className="border-t border-[var(--line)] bg-[var(--bg)] shrink-0 z-20 px-3 pt-2.5 pb-[max(26px,calc(env(safe-area-inset-bottom)+8px))]">
        {sendError && (
          <div className="flex items-center justify-between text-[11.5px] text-[var(--red)] px-2 pb-2">
            <span>{sendError}</span>
            <button
              type="button"
              onClick={() => handleSendMessage(lastFailedText || inputText)}
              className="underline font-medium hover:text-white cursor-pointer ms-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* WhatsApp Closed 24h Template Box */}
        {whatsappClosed && (
          <div className="p-2.5 mb-2 rounded-lg bg-[var(--s2)] border border-[var(--line)] space-y-2">
            <p className="text-[11.5px] text-[var(--amber)]">
              The 24-hour window is closed. Only approved template messages can be sent.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={templateName ? `${templateName}|${templateLanguage}` : ""}
                onChange={(e) => {
                  const [name, lang] = e.target.value.split("|")
                  setTemplateName(name || "")
                  setTemplateLanguage(lang || "")
                }}
                className="flex-1 bg-[var(--s3)] border border-[var(--line2)] rounded-[6px] px-2.5 py-1.5 text-xs text-[var(--t1)]"
              >
                <option value="">Choose a template</option>
                {templates.map((tpl: any) => (
                  <option
                    key={`${tpl.name}-${tpl.language}`}
                    value={`${tpl.name}|${tpl.language}`}
                  >
                    {tpl.name} ({tpl.language})
                  </option>
                ))}
              </select>
              <input
                value={templateParams}
                onChange={(e) => setTemplateParams(e.target.value)}
                placeholder="Body parameters, comma separated"
                className="flex-1 bg-[var(--s3)] border border-[var(--line2)] rounded-[6px] px-2.5 py-1.5 text-xs text-[var(--t1)]"
              />
              <Button
                size="sm"
                disabled={sending || !templateName || !conversationId}
                onClick={async () => {
                  if (!conversationId || !templateName) return
                  setSending(true)
                  setSendError("")
                  try {
                    const res = await fetch("/api/whatsapp/templates", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        conversationId,
                        name: templateName,
                        language: templateLanguage,
                        parameters: templateParams
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) setSendError(data.error || "Template was not sent")
                    else {
                      setTemplateParams("")
                      mutateMessages()
                      toast.success("WhatsApp template sent")
                    }
                  } finally {
                    setSending(false)
                  }
                }}
                className="bg-[#25D366] text-black hover:brightness-105"
              >
                Send template
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Composer Row (+ Attach, Pill Input, Circular Send Button) */}
        <div className="flex items-end gap-2 max-w-full">
          {/* + Attach Button (44px target) */}
          <button
            type="button"
            onClick={() => toast.info("Attachment upload")}
            aria-label="Attach file"
            className="w-11 h-11 rounded-full text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Pill Input (radius 22, --s2, auto-grows up to 5 lines then scrolls) */}
          <div className={cn(
            "flex-1 min-w-0 rounded-[22px] bg-[var(--s2)] border border-[var(--line)] px-4 py-2.5 transition-colors flex items-center",
            platformTheme.focusBorder
          )}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder={isAr ? "اكتب رد…" : platformTheme.placeholder}
              className="w-full bg-transparent text-[15px] text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none resize-none leading-normal font-arabic max-h-[120px] scrollbar-none"
              dir="auto"
              disabled={sending || whatsappClosed}
            />
          </div>

          {/* 44px Circular Primary Send Button */}
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={sending || whatsappClosed || !inputText.trim()}
            aria-label={`Send via ${platformTheme.name}`}
            className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
              platformTheme.sendBg,
              platformTheme.sendText
            )}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Desktop Quick Tools Toolbar (shown on md: screens for power tools) */}
        <div className="hidden md:flex items-center justify-between pt-2 border-t border-[var(--line)]/50 mt-2 px-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toast.info("Attachment upload")}
              className="p-1.5 rounded-[5px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
              title="Attach file"
              aria-label="Attach file"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInputText((prev) => prev + " 👋")}
              className="p-1.5 rounded-[5px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
              title="Insert emoji"
              aria-label="Insert emoji"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setInputText((prev) => prev + (prev ? "\n" : "") + "Payment link: ")
                textareaRef.current?.focus()
              }}
              className="p-1.5 rounded-[5px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
              title="Insert payment link"
              aria-label="Insert payment link"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsAutomationOpen(!isAutomationOpen)}
              className="p-1.5 rounded-[5px] text-[var(--t3)] hover:text-[var(--gold)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
              title="Quick automations"
              aria-label="Quick automations"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRewriteInEgyptian}
              className="h-[24px] px-2 rounded-[5px] border border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s3)] text-[11px] font-medium text-[var(--t2)] hover:text-[var(--gold2)] flex items-center gap-1.5 transition-colors cursor-pointer ms-1"
              title="Rewrite message in friendly Egyptian dialect"
            >
              <Sparkles className="w-3 h-3 text-[var(--gold)]" />
              <span>Rewrite in Egyptian</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--t3)] font-mono">
            <span>⌘ + Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  )
}
