"use client"

import React, { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import {
  ExternalLink,
  Plus,
  RefreshCw,
  Check,
  Radio,
  FileCode,
  Shield,
  HelpCircle,
  Settings,
  Sliders,
  Send,
  Loader2,
} from "lucide-react"
import { Pill } from "@/components/ui/Pill"
import { Button, HoldToConfirm } from "@/components/ui/button"
import { ChannelBadge } from "@/components/ui/ChannelBadge"
import { BRAND } from "@/lib/brand"
import { CopyButton } from "@/components/ui/CopyButton"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface Connection {
  id: string
  platform: string
  page_id?: string
  external_account_id?: string
  account_name?: string
  username?: string
  reconnect_required?: boolean
  status?: string
  phone_number_id?: string
  metadata?: any
  [key: string]: any
}

interface ChannelCardsProps {
  connections?: Connection[]
  onConnectInstagram?: () => void
  onConnectFacebook?: () => void
  onConnectWhatsApp?: () => void
  onConnectTikTok?: () => void
  onConnectTelegram?: () => void
  onDisconnect?: (id: string) => void
  onRefresh?: () => void
}

export function ChannelCards({
  connections = [],
  onConnectInstagram,
  onConnectFacebook,
  onConnectWhatsApp,
  onConnectTikTok,
  onConnectTelegram,
  onDisconnect,
  onRefresh,
}: ChannelCardsProps) {
  const router = useRouter()

  // Dynamic connection filtering
  const igConnection = connections.find((c) => c.platform === "instagram")
  const fbConnections = connections.filter((c) => c.platform === "facebook")
  const waConnections = connections.filter((c) => c.platform === "whatsapp")
  const tgConnection = connections.find((c) => c.platform === "telegram")
  const tiktokConnection = connections.find((c) => c.platform === "tiktok")

  // WhatsApp setup options
  const [whatsappSetupMethod, setWhatsappSetupMethod] = useState<"embedded" | "token">("embedded")
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false)
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("")
  const [whatsappToken, setWhatsappToken] = useState("")
  const [whatsappWabaId, setWhatsappWabaId] = useState("")
  const [whatsappConnecting, setWhatsappConnecting] = useState(false)
  const [whatsappReqsOpen, setWhatsappReqsOpen] = useState(false)

  // Telegram setup
  const [telegramModalOpen, setTelegramModalOpen] = useState(false)
  const [telegramToken, setTelegramToken] = useState("")
  const [telegramConnecting, setTelegramConnecting] = useState(false)
  const [telegramDisconnected, setTelegramDisconnected] = useState(false)

  // Facebook setup
  const [facebookModalOpen, setFacebookModalOpen] = useState(false)
  const [facebookPageIdInput, setFacebookPageIdInput] = useState("")
  const [facebookPageNameInput, setFacebookPageNameInput] = useState("")
  const [facebookAddingById, setFacebookAddingById] = useState(false)

  // TikTok setup
  const [tiktokRegionModalOpen, setTiktokRegionModalOpen] = useState(false)
  const [tiktokModalOpen, setTiktokModalOpen] = useState(false)
  const [tiktokUsername, setTiktokUsername] = useState("")
  const [tiktokAccountId, setTiktokAccountId] = useState("")
  const [tiktokRegion, setTiktokRegion] = useState("EG")
  const [tiktokConnecting, setTiktokConnecting] = useState(false)

  // Webchat widget
  const [widgetModalOpen, setWidgetModalOpen] = useState(false)
  const [widgetGuideOpen, setWidgetGuideOpen] = useState(false)
  const [widgetColor, setWidgetColor] = useState("#C9974C")
  const [widgetGreeting, setWidgetGreeting] = useState("Hello! How can we help you today?")

  const { data: widgetData } = useSWR("/api/webchat/widget", fetcher)
  const activeWidget = widgetData?.widgets?.[0]
  const scriptCode =
    activeWidget?.snippet ||
    `<script src="${BRAND.appUrl}/widget.js" data-cyreax-key="${activeWidget?.public_key || 'live'}" async></script>`

  // Disconnect handler
  const handleDisconnect = async (id: string, name: string) => {
    if (onDisconnect) {
      onDisconnect(id)
      return
    }
    try {
      const res = await fetch(`/api/user/connections?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success(`Disconnected ${name}`)
        onRefresh?.()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Failed to disconnect")
      }
    } catch {
      toast.error("Network error disconnecting")
    }
  }

  // Connect WhatsApp handler
  const handleSaveWhatsApp = async () => {
    if (whatsappSetupMethod === "embedded") {
      // Prompt user to use the working System-user token if Meta JS SDK is not configured
      if (typeof window !== "undefined" && (window as any).FB) {
        setWhatsappConnecting(true)
        ;(window as any).FB.login(
          async (fbRes: any) => {
            const code = fbRes?.authResponse?.code
            if (code) {
              try {
                const res = await fetch("/api/whatsapp/connect", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code }),
                })
                const data = await res.json()
                if (res.ok) {
                  toast.success("WhatsApp Business connected successfully!")
                  setWhatsappModalOpen(false)
                  onRefresh?.()
                } else {
                  toast.error(data.error || "Failed to connect WhatsApp")
                }
              } catch {
                toast.error("Network error connecting WhatsApp")
              } finally {
                setWhatsappConnecting(false)
              }
            } else {
              setWhatsappConnecting(false)
              toast.error("Meta embedded signup was cancelled.")
            }
          },
          {
            config_id: process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID || "",
            response_type: "code",
            override_default_response_type: true,
          }
        )
        return
      } else {
        toast.info("Meta Embedded Signup requires Meta app review. Please use the System-user token option.")
        setWhatsappSetupMethod("token")
        return
      }
    }

    if (!whatsappPhoneNumberId.trim() || !whatsappToken.trim()) {
      toast.error("Please provide both Phone Number ID and System-User Access Token")
      return
    }

    setWhatsappConnecting(true)
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number_id: whatsappPhoneNumberId.trim(),
          access_token: whatsappToken.trim(),
          waba_id: whatsappWabaId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("WhatsApp Business connected successfully!")
        setWhatsappModalOpen(false)
        setWhatsappPhoneNumberId("")
        setWhatsappToken("")
        setWhatsappWabaId("")
        onRefresh?.()
      } else {
        toast.error(data.error || "Failed to connect WhatsApp")
      }
    } catch {
      toast.error("Failed to connect WhatsApp")
    } finally {
      setWhatsappConnecting(false)
    }
  }

  // Connect Telegram handler
  const handleSaveTelegram = async () => {
    if (!telegramToken.trim()) {
      toast.error("Please enter a bot token from @BotFather")
      return
    }

    setTelegramConnecting(true)
    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Connected bot @${data.bot?.username || "TelegramBot"}!`)
        setTelegramModalOpen(false)
        setTelegramDisconnected(false)
        setTelegramToken("")
        onRefresh?.()
      } else {
        toast.error(data.error || "Failed to validate Telegram bot token")
      }
    } catch {
      toast.error("Network error connecting Telegram bot")
    } finally {
      setTelegramConnecting(false)
    }
  }

  // Connect Facebook Page by ID handler
  const handleConnectPageById = async () => {
    if (!facebookPageIdInput.trim()) {
      toast.error("Please enter a valid Facebook Page ID")
      return
    }

    setFacebookAddingById(true)
    try {
      const res = await fetch("/api/facebook/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: facebookPageIdInput.trim(),
          name: facebookPageNameInput.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Connected Facebook page ${data.page?.name || facebookPageIdInput}!`)
        setFacebookModalOpen(false)
        setFacebookPageIdInput("")
        setFacebookPageNameInput("")
        onRefresh?.()
      } else {
        toast.error(data.error || "Failed to connect Facebook page")
      }
    } catch {
      toast.error("Network error connecting Facebook page")
    } finally {
      setFacebookAddingById(false)
    }
  }

  // Connect TikTok handler (real OAuth start)
  const handleSaveTikTok = () => {
    setTiktokModalOpen(false)
    window.location.href = "/api/tiktok/auth"
  }

  return (
    <>
      {/* 3×2 Card Grid (responsive: 1 col < 768, 2 cols 768-1279, 3 cols >= 1280) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 select-none">
        {/* 1. Instagram Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="instagram" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">Instagram</h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Comments, DMs, stories</p>
                </div>
              </div>
              {igConnection ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="neutral" dot={false}>
                  Not connected
                </Pill>
              )}
            </div>

            {/* Connected Account or Empty State */}
            {igConnection ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[10.5px] font-semibold text-[var(--t1)] shrink-0">
                    {(igConnection.metadata?.username || "I")[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] font-medium text-[var(--t1)] truncate">
                    @{igConnection.metadata?.username || "instagram_user"}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[var(--t3)] tabular-nums shrink-0">
                  Active
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--line2)] p-2.5 text-center text-[11.5px] text-[var(--t3)]">
                No Instagram account connected. Connect to automate comments & DMs.
              </div>
            )}

            {/* Token Health */}
            {igConnection && (
              <div className="text-[11px] text-[var(--t3)] font-mono flex items-center gap-1.5 flex-wrap">
                <span>Webhook active</span>
                <span>·</span>
                <span>
                  {igConnection.reconnect_required ? (
                    <strong className="text-red-400 font-medium">Reconnect required</strong>
                  ) : (
                    <strong className="text-emerald-400 font-medium">Token valid</strong>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            {igConnection ? (
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/instagram/auth"
                }}
                className="h-[28px] px-3 text-[11.5px] gap-1.5 font-semibold"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reconnect</span>
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/instagram/auth"
                }}
                className="h-[28px] px-3 text-[11.5px] gap-1.5 font-semibold"
              >
                <span>Connect Instagram</span>
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/instagram")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>
          </div>
        </div>

        {/* 2. Facebook & Messenger Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="facebook" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">
                    Facebook & Messenger
                  </h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Page comments and Messenger</p>
                </div>
              </div>
              {fbConnections.length > 0 ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="neutral" dot={false}>
                  Not connected
                </Pill>
              )}
            </div>

            {/* Connected Pages or Empty State */}
            {fbConnections.length > 0 ? (
              <div className="space-y-1.5 max-h-[110px] overflow-y-auto">
                {fbConnections.map((page) => {
                  const isUser = page.metadata?.is_user_profile
                  const isPending = page.metadata?.status === "pending_confirmation"
                  return (
                    <div
                      key={page.id}
                      className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[9.5px] font-semibold text-[var(--t1)] shrink-0">
                          {(page.metadata?.name || page.page_id || "F")[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11.5px] font-medium text-[var(--t1)] truncate">
                              {page.metadata?.name || `Facebook ${page.page_id}`}
                            </span>
                            {isPending && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium shrink-0">
                                Pending
                              </span>
                            )}
                            {isUser && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-300 font-mono shrink-0">
                                User Account
                              </span>
                            )}
                          </div>
                          <span className="text-[9.5px] text-[var(--t3)] font-mono truncate">
                            ID: {page.metadata?.facebook_id || page.page_id} · Associated with main account
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ChannelBadge channel="facebook" size="sm" className="w-4 h-4 rounded-full" />
                        <ChannelBadge channel="messenger" size="sm" className="w-4 h-4 rounded-full" />
                        <button
                          onClick={() => handleDisconnect(page.id, page.metadata?.name || "Facebook Page")}
                          title="Disconnect page"
                          className="text-[10px] text-[var(--t4)] hover:text-red-400 p-0.5 ms-1 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--line2)] p-2.5 text-center text-[11.5px] text-[var(--t3)]">
                No Facebook pages connected. Connect a page to start automating comments and Messenger.
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFacebookModalOpen(true)}
              className="h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add page</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/facebook")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>
          </div>
        </div>

        {/* 3. WhatsApp Business Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="whatsapp" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">
                    WhatsApp Business
                  </h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Cloud API · templates</p>
                </div>
              </div>
              {waConnections.length > 0 ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="neutral" dot={false}>
                  Not connected
                </Pill>
              )}
            </div>

            {/* Connected Numbers or Setup Options */}
            {waConnections.length > 0 ? (
              <div className="space-y-1.5 max-h-[110px] overflow-y-auto">
                {waConnections.map((wa) => (
                  <div
                    key={wa.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChannelBadge channel="whatsapp" size="sm" className="w-4 h-4 shrink-0" />
                      <span className="text-[11.5px] font-medium text-[var(--t1)] truncate font-mono">
                        {wa.metadata?.display_phone_number || wa.page_id}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDisconnect(wa.id, wa.page_id || "WhatsApp number")}
                      title="Disconnect number"
                      className="text-[10px] text-[var(--t4)] hover:text-red-400 p-0.5 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div
                  onClick={() => setWhatsappSetupMethod("embedded")}
                  className={cn(
                    "rounded-lg border p-2 space-y-0.5 cursor-pointer transition-colors",
                    whatsappSetupMethod === "embedded"
                      ? "border-[var(--goldline)] bg-[var(--goldbg)]/20"
                      : "border-[var(--line)] bg-[var(--s2)] hover:border-[var(--line2)]"
                  )}
                >
                  <div className="font-semibold text-[var(--t1)]">Embedded Signup</div>
                  <p className="text-[var(--t3)] leading-tight text-[10px]">
                    Log in with Meta, pick or create a number.
                  </p>
                </div>

                <div
                  onClick={() => setWhatsappSetupMethod("token")}
                  className={cn(
                    "rounded-lg border p-2 space-y-0.5 cursor-pointer transition-colors",
                    whatsappSetupMethod === "token"
                      ? "border-[var(--goldline)] bg-[var(--goldbg)]/20"
                      : "border-[var(--line)] bg-[var(--s2)] hover:border-[var(--line2)]"
                  )}
                >
                  <div className="font-semibold text-[var(--t1)]">System-user token</div>
                  <p className="text-[var(--t3)] leading-tight text-[10px]">
                    Meta Business Suite API token with WABA ID.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              variant="default"
              size="sm"
              onClick={() => setWhatsappModalOpen(true)}
              className="h-[28px] px-3 text-[11.5px] font-medium"
            >
              {waConnections.length > 0 ? "Add number" : "Connect WhatsApp"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/whatsapp")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWhatsappReqsOpen(true)}
              className="h-[28px] px-2 text-[11px] font-medium"
            >
              Guide
            </Button>
          </div>
        </div>

        {/* 4. TikTok Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="tiktok" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">TikTok</h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Comment replies, comment-to-DM</p>
                </div>
              </div>
              {tiktokConnection ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="blue" dot={false}>
                  Beta
                </Pill>
              )}
            </div>

            {/* Region Policy Body Copy or Connected State */}
            {tiktokConnection ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2 flex items-center justify-between">
                <span className="text-[12px] font-medium text-[var(--t1)]">
                  @{tiktokConnection.metadata?.username || "tiktok_account"}
                </span>
                <button
                  onClick={() => handleDisconnect(tiktokConnection.id, "TikTok account")}
                  className="text-[10px] text-[var(--t4)] hover:text-red-400 p-0.5 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
                Messaging depends on TikTok's regional approval. We check this account's region when you connect and show what's available.
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (onConnectTikTok) {
                  onConnectTikTok()
                } else {
                  window.location.href = "/api/tiktok/auth"
                }
              }}
              className="h-[28px] px-3 text-[11.5px] font-medium"
            >
              {tiktokConnection ? "Reconnect TikTok" : "Connect TikTok"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/tiktok")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTiktokRegionModalOpen(true)}
              className="h-[28px] px-2 text-[11px] font-medium"
            >
              Details
            </Button>
          </div>
        </div>

        {/* 5. Telegram Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="telegram" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">Telegram</h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Bot DMs and channel broadcasts</p>
                </div>
              </div>
              {tgConnection && !telegramDisconnected ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="neutral" dot={false}>
                  Not connected
                </Pill>
              )}
            </div>

            {/* Connected Bot or Empty State */}
            {tgConnection && !telegramDisconnected ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[10.5px] font-semibold text-[var(--t1)] shrink-0">
                    B
                  </div>
                  <span className="text-[12px] font-medium text-[var(--t1)] truncate">
                    @{tgConnection.metadata?.username || tgConnection.page_id || "TelegramBot"}
                  </span>
                </div>

                <HoldToConfirm
                  label="Hold to disconnect"
                  confirmingLabel="Disconnecting..."
                  undoMessage="Telegram bot disconnected."
                  onConfirm={() => {
                    handleDisconnect(tgConnection.id, tgConnection.metadata?.username || "Telegram bot")
                  }}
                  className="h-[26px] px-2 text-[10.5px] shrink-0"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--line2)] p-2.5 text-center text-[11.5px] text-[var(--t3)]">
                No bot connected. Add your bot token to start receiving messages.
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTelegramModalOpen(true)}
              className="h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add bot</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/telegram")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open("https://t.me/BotFather", "_blank")}
              className="h-[28px] px-2 text-[11px] font-medium gap-1"
            >
              <span>@BotFather</span>
              <ExternalLink className="w-3 h-3 text-[var(--t3)]" />
            </Button>
          </div>
        </div>

        {/* 6. Website Chat Card */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between min-h-[176px] space-y-3.5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <ChannelBadge channel="webchat" size="md" />
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--t1)]">Website chat</h3>
                  <p className="text-[11.5px] text-[var(--t3)]">Embeddable web chat widget</p>
                </div>
              </div>
              {activeWidget && activeWidget.enabled ? (
                <Pill variant="green" dot>
                  Live
                </Pill>
              ) : (
                <Pill variant="neutral" dot={false}>
                  Ready to embed
                </Pill>
              )}
            </div>

            {/* Script Snippet Block with CopyButton */}
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2 font-mono text-[10.5px] text-[var(--t2)] flex items-center justify-between gap-2 overflow-hidden">
              <code dir="ltr" className="truncate max-w-[210px] text-[var(--t3)] select-all">
                {scriptCode}
              </code>
              <CopyButton value={scriptCode} label="embed script" />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWidgetModalOpen(true)}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Customize
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/dashboard/platforms/webchat")}
              className="h-[28px] px-2.5 text-[11.5px] font-medium"
            >
              Manage
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWidgetGuideOpen(true)}
              className="h-[28px] px-2 text-[11px] font-medium"
            >
              Guide
            </Button>
          </div>
        </div>
      </div>

      {/* WhatsApp Modal Dialog */}
      <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Connect WhatsApp Business
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              {whatsappSetupMethod === "embedded"
                ? "Connect your Meta WhatsApp Business account using Embedded Signup."
                : "Enter your Meta system-user token and Phone Number ID from Business Manager."}
            </DialogDescription>
          </DialogHeader>

          {whatsappSetupMethod === "embedded" ? (
            <div className="space-y-3 py-2 text-xs text-[var(--t2)]">
              <p>
                Embedded Signup will open a Meta popup dialog where you can log in, select your Business Portfolio, and register or select your WhatsApp number.
              </p>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-3 text-[11px] text-[var(--t3)] space-y-1">
                <div>✓ Retains your official green tick if approved</div>
                <div>✓ Generates 24-hour service messaging session webhooks</div>
                <div>✓ Requires valid Meta payment method for conversation charges</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  Phone Number ID
                </label>
                <input
                  value={whatsappPhoneNumberId}
                  onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                  placeholder="e.g. 104829104829104"
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  System-User Permanent Access Token
                </label>
                <input
                  type="password"
                  value={whatsappToken}
                  onChange={(e) => setWhatsappToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  WABA ID (Optional)
                </label>
                <input
                  value={whatsappWabaId}
                  onChange={(e) => setWhatsappWabaId(e.target.value)}
                  placeholder="e.g. 29384729384729"
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1 text-[11px] text-[var(--t3)]">
                <div className="font-semibold text-[var(--t1)]">How to get your credentials:</div>
                <div>1. Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-[var(--gold)] underline">Meta for Developers</a> → Your App → WhatsApp → API Setup.</div>
                <div>2. Copy your <strong className="text-[var(--t1)]">Phone number ID</strong> & <strong className="text-[var(--t1)]">WhatsApp Business Account ID</strong>.</div>
                <div>3. In Business Settings → System Users, generate a token with <code className="bg-[var(--s3)] px-1 rounded text-[10px]">whatsapp_business_messaging</code>.</div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWhatsappModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveWhatsApp}
              disabled={whatsappConnecting}
              className="h-[28px] text-xs font-medium"
            >
              {whatsappConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Requirements Modal */}
      <Dialog open={whatsappReqsOpen} onOpenChange={setWhatsappReqsOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              WhatsApp Business API Requirements
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Before sending automated customer service messages, ensure you meet Meta requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 text-xs text-[var(--t2)]">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-[var(--t1)] block">1. Clean Phone Number</strong>
              <p className="text-[11px] text-[var(--t3)]">
                The number must not currently be registered in the standard WhatsApp or WhatsApp Business mobile apps. Delete the account from the app first if reusing.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-[var(--t1)] block">2. Meta Business Portfolio & Billing</strong>
              <p className="text-[11px] text-[var(--t3)]">
                Meta requires a credit card attached to your WhatsApp Business Account. First 1,000 service conversations each month are free.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-[var(--t1)] block">3. Display Name Approval</strong>
              <p className="text-[11px] text-[var(--t3)]">
                The business name must match your legal business documents or commercial brand presence.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWhatsappReqsOpen(false)}
              className="h-[28px] text-xs"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Telegram Add Bot Modal */}
      <Dialog open={telegramModalOpen} onOpenChange={setTelegramModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Connect Telegram Bot
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Provide your HTTP API token from BotFather to enable 2-way Telegram messaging.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Telegram Bot Token
              </label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              />
            </div>
            <p className="text-[10.5px] text-[var(--t3)]">
              Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[var(--gold)] underline">@BotFather</a> on Telegram, create a bot with <code className="bg-[var(--s2)] px-1 py-0.5 rounded">/newbot</code>, and paste the API token here.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTelegramModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveTelegram}
              disabled={telegramConnecting}
              className="h-[28px] text-xs font-medium"
            >
              {telegramConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save bot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facebook Add Page Modal */}
      <Dialog open={facebookModalOpen} onOpenChange={setFacebookModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Add Facebook & Messenger Page
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Connect additional pages associated with your Meta Business account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-[var(--t2)]">
            <p className="leading-relaxed">
              Connect additional Facebook pages to automate comments and Messenger. All connected pages are associated with your main account.
            </p>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-3 space-y-2.5">
              <span className="text-[11.5px] font-semibold text-[var(--t1)] block">Link Page by ID</span>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Facebook Page ID (e.g. 61595813917573)"
                  value={facebookPageIdInput}
                  onChange={(e) => setFacebookPageIdInput(e.target.value)}
                  className="w-full h-8 bg-[var(--s3)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] font-mono placeholder:text-[var(--t4)] focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Page Name (e.g. Cultleaderzoz Connected Page)"
                  value={facebookPageNameInput}
                  onChange={(e) => setFacebookPageNameInput(e.target.value)}
                  className="w-full h-8 bg-[var(--s3)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnectPageById}
                  disabled={facebookAddingById || !facebookPageIdInput.trim()}
                  className="h-[28px] text-xs font-medium w-full"
                >
                  {facebookAddingById ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link Page to Main Account"}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10.5px] text-[var(--t4)]">
              <div className="h-px bg-[var(--line)] flex-1" />
              <span>OR CONNECT VIA FACEBOOK LOGIN</span>
              <div className="h-px bg-[var(--line)] flex-1" />
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 text-[11px] text-[var(--t3)] space-y-1">
              <div>✓ Automatically loads all Pages managed by your Facebook user profile</div>
              <div>✓ Enables instant Messenger and comment automation</div>
              <div className="text-[10px] text-[var(--gold)] pt-0.5">
                💡 <em>Make sure you are switched to the personal Facebook account that manages your Facebook Business Pages when authorizing.</em>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFacebookModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setFacebookModalOpen(false)
                if (onConnectFacebook) {
                  onConnectFacebook()
                } else {
                  window.location.href = "/api/facebook/auth"
                }
              }}
              className="h-[28px] text-xs font-medium"
            >
              Continue to Facebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TikTok Region Details Modal */}
      <Dialog open={tiktokRegionModalOpen} onOpenChange={setTiktokRegionModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              TikTok Region & Feature Availability
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              TikTok Business Messaging rules based on official developer policies.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 text-xs text-[var(--t2)]">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-emerald-400 block font-mono text-[11.5px]">
                ✓ Supported for DMs & Automations
              </strong>
              <p className="text-[11px] text-[var(--t3)]">
                Egypt, Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman, and most countries outside the EEA and UK.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-amber-400 block font-mono text-[11.5px]">
                ⚡ Comment-to-Message Limits
              </strong>
              <p className="text-[11px] text-[var(--t3)]">
                TikTok restricts direct automated DMs triggered from comment keywords strictly to business accounts in Vietnam, Indonesia, and Thailand. Public comment replies are supported globally.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
              <strong className="text-red-400 block font-mono text-[11.5px]">
                ✕ Restricted Regions
              </strong>
              <p className="text-[11px] text-[var(--t3)]">
                EEA member states, Switzerland, and the UK are currently blocked by TikTok regulatory compliance.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTiktokRegionModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TikTok Connect Account Modal */}
      <Dialog open={tiktokModalOpen} onOpenChange={setTiktokModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <ChannelBadge channel="tiktok" size="sm" />
              Connect TikTok Account
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Automate TikTok comment replies, keyword triggers, and DMs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                TikTok Username / Handle
              </label>
              <div className="relative">
                <span className="absolute start-2.5 top-2 text-[var(--t3)] font-mono text-xs">@</span>
                <input
                  value={tiktokUsername}
                  onChange={(e) => setTiktokUsername(e.target.value.replace(/^@/, ""))}
                  placeholder="brand_official"
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] ps-6 pe-2.5 text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--line2)] font-mono"
                />
              </div>
              <p className="text-[10.5px] text-[var(--t3)] mt-1">
                Your public TikTok creator or business account handle.
              </p>
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Region / Country
              </label>
              <select
                value={tiktokRegion}
                onChange={(e) => setTiktokRegion(e.target.value)}
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2 text-xs text-[var(--t1)] focus:outline-none cursor-pointer"
              >
                <option value="EG">Egypt (MENA)</option>
                <option value="SA">Saudi Arabia (KSA)</option>
                <option value="AE">United Arab Emirates (UAE)</option>
                <option value="KW">Kuwait</option>
                <option value="QA">Qatar</option>
                <option value="US">United States</option>
                <option value="GLOBAL">Global / Other</option>
              </select>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1 text-[11px] text-[var(--t3)]">
              <div className="font-semibold text-[var(--t1)]">Automation features:</div>
              <div>✓ Instant auto-reply to comments with keyword triggers</div>
              <div>✓ Direct conversion links (tiktok.me ref routing)</div>
              <div>✓ AI FAQ answering and lead capture</div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTiktokModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveTikTok}
              className="h-[28px] text-xs font-medium"
            >
              Sign in with TikTok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Website Chat Widget Customizer */}
      <Dialog open={widgetModalOpen} onOpenChange={setWidgetModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Customize Website Chat Widget
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Adjust widget appearance and initial greeting for your website.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Accent Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="w-8 h-8 rounded border border-[var(--line)] bg-transparent cursor-pointer"
                />
                <span className="font-mono text-xs text-[var(--t3)]">{widgetColor}</span>
              </div>
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Welcome Greeting
              </label>
              <textarea
                rows={2}
                value={widgetGreeting}
                onChange={(e) => setWidgetGreeting(e.target.value)}
                className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-[6px] p-2 text-xs text-[var(--t1)] focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWidgetModalOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setWidgetModalOpen(false)
                toast.success("Widget settings saved!")
              }}
              className="h-[28px] text-xs font-medium"
            >
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Website Chat Install Guide */}
      <Dialog open={widgetGuideOpen} onOpenChange={setWidgetGuideOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Install Chat Widget
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Copy and paste the snippet right before the &lt;/body&gt; tag.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-[var(--t2)]">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 font-mono text-[11px] text-[var(--t1)] flex items-center justify-between">
              <code dir="ltr">{scriptCode}</code>
              <CopyButton value={scriptCode} label="code snippet" />
            </div>

            <div className="space-y-1.5 text-[11.5px] text-[var(--t3)]">
              <p>• <strong>Shopify:</strong> Online Store → Themes → Edit code → theme.liquid</p>
              <p>• <strong>Salla / Zid:</strong> App store custom script settings</p>
              <p>• <strong>WordPress:</strong> Install Header and Footer Scripts plugin</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWidgetGuideOpen(false)}
              className="h-[28px] text-xs"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
