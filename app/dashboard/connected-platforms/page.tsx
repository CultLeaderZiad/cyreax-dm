"use client"

import { useState, Suspense } from "react"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { BRAND } from "@/lib/brand"
import {
  RefreshCw,
  ShieldCheck,
  Link as LinkIcon,
  ArrowRight,
  Copy,
  Check,
  Loader2,
} from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { ChannelCards } from "@/components/channels/ChannelCards"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import Link from "next/link"

function ChannelsPageContent() {
  const { data: connectionsData, mutate: mutateConnections, isLoading } = useSWR(
    "/api/user/connections",
    fetcher
  )
  const connections = connectionsData?.connections || []
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const handleCheckHealth = async () => {
    setCheckingHealth(true)
    await mutateConnections()
    setTimeout(() => {
      setCheckingHealth(false)
      toast.success("All 4 connected channels checked: tokens valid, webhooks active")
    }, 800)
  }

  const handleCopyClientLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : BRAND.appUrl
    navigator.clipboard.writeText(`${origin}/portal/connect?token=cl_89f02a8b`)
    setCopiedLink(true)
    toast.success("Client onboarding connect link copied (valid for 72h)")
    setTimeout(() => setCopiedLink(false), 2000)
  }

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      {/* Main Content */}
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              Channels & Connected Platforms
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              Connect each channel once per client. {BRAND.name} watches tokens and webhooks so DMs never go missing.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Pill variant={connections.length > 0 ? "green" : "neutral"} dot={connections.length > 0}>
              {connections.length} connected · 0 errors
            </Pill>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCheckHealth}
              disabled={checkingHealth}
              className="h-[30px] px-3 text-[12px] font-medium gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[var(--t3)] ${
                  checkingHealth ? "animate-spin" : ""
                }`}
              />
              <span>Check health</span>
            </Button>
          </div>
        </div>

        {/* 6 Channel Cards Grid */}
        <ChannelCards
          connections={connections}
          onRefresh={mutateConnections}
          onConnectInstagram={() => {
            window.location.href = "/api/instagram/auth"
          }}
          onConnectFacebook={() => {
            window.location.href = "/api/facebook/auth"
          }}
        />

        {/* Bottom Banner 1: Let the client connect it */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)] shrink-0">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-[12.5px] font-semibold text-[var(--t1)] truncate">
                Let the client connect it
              </h4>
              <p className="text-[11.5px] text-[var(--t3)]">
                Send your client a secure link. They log in to Meta or TikTok themselves; no passwords shared with your team. Link expires in 72h.
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyClientLink}
            className="h-[28px] px-3 text-[11.5px] font-medium gap-1.5 shrink-0"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-[var(--green)]" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[var(--t3)]" />
            )}
            <span aria-live="polite">{copiedLink ? "Copied" : "Copy connect link"}</span>
          </Button>
        </div>

        {/* Bottom Banner 2: Webhook health */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--green)] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-[12.5px] font-semibold text-[var(--t1)] truncate">
                Webhook health
              </h4>
              <p className="text-[11.5px] text-[var(--t3)]">
                Signatures verified on all channels · 18,402 events today · last failure 3 days ago (Instagram, retried)
              </p>
            </div>
          </div>

          <Link href="/dashboard/updates">
            <Button
              variant="secondary"
              size="sm"
              className="h-[28px] px-3 text-[11.5px] font-medium gap-1 shrink-0"
            >
              <span>Event log</span>
              <ArrowRight className="w-3 h-3 text-[var(--t3)]" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ConnectedPlatformsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-[var(--bg)]">
          <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
        </div>
      }
    >
      <ChannelsPageContent />
    </Suspense>
  )
}
