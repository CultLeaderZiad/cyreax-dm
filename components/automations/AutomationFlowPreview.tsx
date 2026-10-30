"use client"

import React from "react"
import { Eye, ExternalLink, Sparkles, MessageSquare, Send, GitBranch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { Tag } from "@/components/ui/Tag"
import { ChannelBadge } from "@/components/ui/ChannelBadge"
import Link from "next/link"
import { toast } from "sonner"
import type { Automation } from "@/lib/types"

interface AutomationFlowPreviewProps {
  automation: Automation | null
  onTest?: () => void
}

export function AutomationFlowPreview({ automation, onTest }: AutomationFlowPreviewProps) {
  if (!automation) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[var(--s1)] border-s border-[var(--line)] select-none">
        <div className="w-10 h-10 rounded-xl bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t3)] mb-3">
          <GitBranch className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-[var(--t1)] mb-1">Select an automation</h4>
        <p className="text-xs text-[var(--t3)] max-w-xs leading-relaxed">
          Choose a rule from the table to inspect its trigger conditions, public replies, and DM branch logic.
        </p>
      </div>
    )
  }

  const channel = (automation.platform || "instagram").toLowerCase()
  const isActive = automation.is_active
  const isDraft = !isActive && automation.id === "demo-5"

  // Extract keywords from trigger_value or fallback
  const rawKeywords = automation.trigger_value || (automation as any).keywords || ""
  const keywords: string[] = rawKeywords
    ? rawKeywords.split(",").map((k: string) => k.trim()).filter(Boolean)
    : []

  const publicReplyText =
    automation.response_content?.public_replies?.[0] ||
    (automation as any).public_reply_content ||
    null

  const dmText =
    automation.response_content?.message ||
    (automation.response_content as any)?.text ||
    null

  const buttonText =
    automation.response_content?.card?.buttons?.[0]?.title ||
    automation.response_content?.quick_replies?.[0]?.title ||
    (automation.response_content as any)?.buttons?.[0]?.title ||
    (automation.id === "demo-1" ? "أيوة ابعتي اللينك" : null)

  // Determine computed stats (hide tiles without data)
  const stats = (automation as any).stats || (
    automation.id === "demo-1"
      ? { runs: "1,126", leads: "160", sales: "EGP 21.6k" }
      : automation.id === "demo-2"
      ? { runs: "342", leads: "14", sales: null }
      : automation.id === "demo-3"
      ? { runs: "88", leads: "8", sales: null }
      : automation.id === "demo-4"
      ? { runs: "214", leads: null, sales: null }
      : automation.id === "demo-6"
      ? { runs: "57", leads: "4", sales: null }
      : null
  )

  const hasStats = stats && (stats.runs || stats.leads || stats.sales)

  // Trigger descriptions based on trigger_source
  const triggerLabel =
    automation.trigger_source === "comment"
      ? (keywords.length > 0
          ? 'Comment on Reel "Vitamin C in 30 sec" contains'
          : "Any comment on selected posts")
      : automation.trigger_source === "dm"
      ? (keywords.length > 0 ? "Direct message contains keyword" : "New direct message received")
      : automation.trigger_source === "story"
      ? "Story mention or story reply"
      : automation.trigger_source === "ice_breaker"
      ? "User taps ice breaker question in chat"
      : "Trigger condition"

  const isSupportedType = ["comment", "dm", "story", "ice_breaker"].includes(
    automation.trigger_source || "comment"
  )

  return (
    <div className="h-full flex flex-col bg-[var(--s1)] border-s border-[var(--line)] overflow-y-auto select-none scrollbar-thin scrollbar-thumb-[var(--line2)] scrollbar-track-transparent">
      {/* Header */}
      <div className="p-4 border-b border-[var(--line)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isDraft ? (
            <Pill variant="amber" dot={false}>
              Draft
            </Pill>
          ) : isActive ? (
            <Pill variant="green" dot>
              Live
            </Pill>
          ) : (
            <Pill variant="neutral" dot={false}>
              Paused
            </Pill>
          )}
          <span className="text-[11px] text-[var(--t3)] font-mono">
            Edited 2d ago by Lina M.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (onTest) onTest()
              else toast.info(`Simulated test run for "${automation.name}"`)
            }}
            className="h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Test</span>
          </Button>

          <Link href="/dashboard/flows">
            <Button
              variant="secondary"
              size="sm"
              className="h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
            >
              <span>Open builder</span>
              <ExternalLink className="w-3 h-3 text-[var(--t3)]" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Title & Stats */}
      <div className="p-4 border-b border-[var(--line)] space-y-3.5">
        <h3 className="text-[16px] font-semibold text-[var(--t1)] tracking-tight">
          {automation.name || "Untitled automation"}
        </h3>

        {/* Dynamic Metric Cards (hides tiles without data) */}
        {hasStats && (
          <div className="grid grid-cols-3 gap-2">
            {stats.runs && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 text-center">
                <div className="font-mono text-[14px] font-semibold text-[var(--t1)] tabular-nums">
                  {stats.runs}
                </div>
                <div className="text-[10.5px] text-[var(--t3)] font-mono mt-0.5">Runs</div>
              </div>
            )}

            {stats.leads && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 text-center">
                <div className="font-mono text-[14px] font-semibold text-[var(--t1)] tabular-nums">
                  {stats.leads}
                </div>
                <div className="text-[10.5px] text-[var(--t3)] font-mono mt-0.5">Leads</div>
              </div>
            )}

            {stats.sales && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 text-center">
                <div className="font-mono text-[14px] font-semibold text-[var(--t1)] tabular-nums">
                  {stats.sales}
                </div>
                <div className="text-[10.5px] text-[var(--t3)] font-mono mt-0.5">Attributed sales</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flow visualizer */}
      {!isSupportedType ? (
        <div className="p-6 text-center text-xs text-[var(--t3)]">
          Preview not available for this type yet
        </div>
      ) : (
        <div className="p-4 space-y-3 flex-1">
          {/* Step 1: Trigger */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[var(--gold)]">
              <Sparkles className="w-3 h-3 text-[var(--gold)]" />
              <span>⚡ Trigger</span>
            </div>

            <div className="rounded-xl border border-[var(--goldline)] bg-[var(--goldbg)] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ChannelBadge channel={channel} size="sm" className="w-4 h-4 rounded-full" />
                <span className="text-[12px] text-[var(--t1)] font-medium">
                  {triggerLabel}
                </span>
              </div>

              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {keywords.map((kw, i) => (
                    <Tag key={i} dir="auto">{kw}</Tag>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Public Reply (only when present) */}
          {publicReplyText && (
            <>
              <div className="flex justify-center">
                <div className="w-px h-5 bg-[var(--line2)]" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-[var(--t3)]">
                  <MessageSquare className="w-3 h-3" />
                  <span>Public reply</span>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-[var(--s2)] p-3">
                  <p dir="auto" className="text-[12.5px] text-[var(--t1)] leading-relaxed">
                    {publicReplyText}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Send DM (only when present) */}
          {dmText && (
            <>
              <div className="flex justify-center">
                <div className="w-px h-5 bg-[var(--line2)]" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-[var(--t3)]">
                  <Send className="w-3 h-3" />
                  <span>Send DM</span>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-[var(--s3)] p-3 space-y-2.5">
                  <p dir="auto" className="text-[12.5px] text-[var(--t1)] leading-relaxed">
                    {dmText}
                  </p>

                  {buttonText && (
                    <div
                      className="rounded-lg border border-[var(--line2)] bg-[var(--s2)] py-1.5 px-3 text-center text-[12px] font-medium text-[var(--gold2)] hover:bg-[var(--s1)] transition-colors cursor-pointer"
                      dir="auto"
                    >
                      {buttonText}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Split Outcome Branches (if button or demo-1) */}
          {(buttonText || automation.id === "demo-1") && (
            <div className="pt-2">
              <div className="text-[10px] font-mono text-[var(--t4)] text-center mb-2">
                button tapped?
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* YES Branch */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
                  <span className="font-mono text-[10.5px] font-semibold text-[var(--green)]">
                    YES · 61%
                  </span>
                  <p className="text-[11.5px] text-[var(--t2)] leading-snug">
                    Send Paymob link, tag <Tag className="text-[10px]">checkout</Tag>
                  </p>
                </div>

                {/* NO Branch */}
                <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 space-y-1">
                  <span className="font-mono text-[10.5px] font-semibold text-[var(--t3)]">
                    NO REPLY 2H · 39%
                  </span>
                  <p className="text-[11.5px] text-[var(--t2)] leading-snug">
                    <span className="text-[var(--gold)] font-medium">AI Agent</span> follows up once
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
