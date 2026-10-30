"use client"

import { useState, useEffect, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConversationList } from "@/components/inbox/ConversationList"
import { ChatWindow } from "@/components/inbox/ChatWindow"
import { CustomerCopilotRail } from "@/components/inbox/CustomerCopilotRail"
import { MobileInboxView } from "@/components/mobile"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import ConnectPlatformEmptyState from "@/components/dashboard/ConnectPlatformEmptyState"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

function InboxContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cParam = searchParams.get("c")

  const { userId, isLoading } = useInstagramSession()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(cParam)
  const [selectedRecipientName, setSelectedRecipientName] = useState<string | null>(null)
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<string>("instagram")
  const [isRailOpenMobile, setIsRailOpenMobile] = useState<boolean>(false)
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(false)

  // Fetch real conversations for mobile inbox view
  const { data: convData, isLoading: convLoading } = useSWR(
    userId ? `/api/inbox/conversations?userId=${userId}` : null,
    fetcher
  )
  const rawConversations = Array.isArray(convData) ? convData : []

  // Track responsive screen size for bottom sheet vs side drawer
  useEffect(() => {
    const updateSize = () => {
      setIsMobileScreen(window.innerWidth < 768)
    }
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  // Sync state with ?c= parameter in URL for browser back/forward and deep linking
  useEffect(() => {
    if (cParam) {
      setSelectedConversationId(cParam)
      if (rawConversations.length > 0) {
        const found = rawConversations.find((c: any) => String(c.id) === String(cParam))
        if (found) {
          setSelectedRecipientName(found.recipient_username || "Customer")
          setSelectedRecipientId(found.recipient_id ? String(found.recipient_id) : String(found.id))
          setSelectedPlatform(found.platform || "instagram")
        }
      }
    } else {
      // If no query parameter and on phone, clear selected so List view is displayed
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setSelectedConversationId(null)
      }
    }
  }, [cParam, rawConversations])

  const handleSelect = useCallback(
    (id: string, name: string, recipientId: string, platform: string) => {
      setSelectedConversationId(id)
      setSelectedRecipientName(name)
      setSelectedRecipientId(recipientId)
      setSelectedPlatform(platform || "instagram")

      // Update URL with ?c={id} without scrolling or full page reload
      const url = new URL(window.location.href)
      url.searchParams.set("c", id)
      router.push(url.pathname + url.search, { scroll: false })
    },
    [router]
  )

  const handleBack = useCallback(() => {
    setSelectedConversationId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("c")
    router.push(url.pathname + (url.search ? url.search : ""), { scroll: false })
  }, [router])

  const channel = selectedPlatform === "facebook" ? "messenger" : selectedPlatform.toLowerCase()

  // Contact context query for selected contact
  const { data: contactContext, mutate: mutateContact } = useSWR(
    selectedRecipientId
      ? `/api/contacts?externalId=${encodeURIComponent(selectedRecipientId)}&channel=${encodeURIComponent(
          channel
        )}&conversationId=${encodeURIComponent(selectedConversationId || "")}`
      : null,
    fetcher
  )

  const botPaused = Boolean(contactContext?.contact?.bot_paused)

  const handleToggleBot = async () => {
    const contactId = contactContext?.contact?.id
    if (contactId) {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_paused: !botPaused }),
      }).catch(() => {})
    } else if (selectedRecipientId) {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          externalId: selectedRecipientId,
          displayName: selectedRecipientName,
          bot_paused: !botPaused,
        }),
      }).catch(() => {})
    }
    mutateContact()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] md:h-[calc(100vh-52px)] bg-[var(--bg)]">
        <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="h-[100dvh] md:h-[calc(100vh-52px)] bg-[var(--bg)] p-6 flex items-center justify-center">
        <ConnectPlatformEmptyState description="Connect your Instagram, WhatsApp, or Messenger channel to use the unified inbox." />
      </div>
    )
  }

  return (
    <div className="h-[100dvh] md:h-[calc(100vh-52px)] flex bg-[var(--bg)] overflow-hidden w-full relative">
      {/* Column 1: Conversations List */}
      {/* Mobile (<768px): MobileInboxView matching 03-inbox-tabbar.png when no conversation is selected */}
      <div
        className={cn(
          "w-full shrink-0 h-full md:hidden",
          selectedConversationId ? "hidden" : "flex flex-col"
        )}
      >
        <MobileInboxView
          conversations={rawConversations}
          loading={convLoading}
          activeConversationId={selectedConversationId}
          onSelectConversation={(id, name, recipientId, platform) => {
            handleSelect(id, name || "Customer", recipientId || "", platform || "instagram")
          }}
        />
      </div>

      {/* Desktop (>=768px): Standard 300px ConversationList */}
      <div
        className="hidden md:flex w-[300px] shrink-0 h-full flex-col border-e border-[var(--line)]"
      >
        <ConversationList
          userId={userId}
          selectedId={selectedConversationId}
          onSelect={handleSelect}
        />
      </div>

      {/* Column 2: Chat Window / Thread (<768: visible only if c selected; >=768: flex-1 fluid) */}
      <div
        className={cn(
          "flex-1 w-full h-full flex flex-col min-w-0",
          selectedConversationId ? "flex" : "hidden md:flex"
        )}
      >
        <ChatWindow
          conversationId={selectedConversationId}
          recipientName={selectedRecipientName}
          recipientId={selectedRecipientId || undefined}
          platform={selectedPlatform}
          userId={userId}
          onBack={handleBack}
          contactContext={contactContext}
          mutateContact={mutateContact}
          onOpenContextRail={() => setIsRailOpenMobile(true)}
        />
      </div>

      {/* Column 3: Customer Copilot Rail (desktop >=1024px fixed 300px column) */}
      <div className="hidden lg:flex w-[300px] h-full shrink-0 border-s border-[var(--line)]">
        <CustomerCopilotRail
          recipientName={selectedRecipientName}
          recipientId={selectedRecipientId || undefined}
          platform={selectedPlatform}
          contactContext={contactContext}
          botPaused={botPaused}
          onToggleBot={handleToggleBot}
        />
      </div>

      {/* Mobile Bottom Sheet (<768px, radius 16, drag handle, focus-trapped) & Tablet Side Sheet (768-1023px) */}
      <Sheet open={isRailOpenMobile} onOpenChange={setIsRailOpenMobile}>
        {isMobileScreen ? (
          <SheetContent
            side="bottom"
            className="p-0 rounded-t-[16px] bg-[var(--s1)] border-t border-[var(--line)] max-h-[85vh] h-[80vh] overflow-hidden flex flex-col focus:outline-none"
          >
            {/* Mobile Bottom Sheet drag handle */}
            <div className="w-10 h-1 bg-[var(--line3)] rounded-full mx-auto my-2.5 shrink-0" />
            <SheetHeader className="sr-only">
              <SheetTitle>Contact details & copilot</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
              <CustomerCopilotRail
                recipientName={selectedRecipientName}
                recipientId={selectedRecipientId || undefined}
                platform={selectedPlatform}
                contactContext={contactContext}
                botPaused={botPaused}
                onToggleBot={handleToggleBot}
              />
            </div>
          </SheetContent>
        ) : (
          <SheetContent
            side="right"
            className="p-0 w-[320px] bg-[var(--s1)] border-s border-[var(--line)] h-full overflow-hidden flex flex-col focus:outline-none"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Conversation context</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto min-h-0">
              <CustomerCopilotRail
                recipientName={selectedRecipientName}
                recipientId={selectedRecipientId || undefined}
                platform={selectedPlatform}
                contactContext={contactContext}
                botPaused={botPaused}
                onToggleBot={handleToggleBot}
              />
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[100dvh] md:h-[calc(100vh-52px)] bg-[var(--bg)]">
          <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
        </div>
      }
    >
      <InboxContent />
    </Suspense>
  )
}
