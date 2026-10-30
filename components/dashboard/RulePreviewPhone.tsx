"use client"

import React from "react"
import {
  ArrowLeft, Phone, Video, Camera, Mic,
  Image as ImageIcon, Image as PicIcon,
} from "lucide-react"
import type { ProButton, QuickReplyOption } from "@/lib/types"

/* ── Types ── */

interface RulePreviewPhoneProps {
  userId: string
  editRule?: any
  triggerSource: "comment" | "dm" | "story"
  triggers: string[]
  type: "text" | "card" | "media"
  messageText: string
  cardTitle: string
  cardSubtitle: string
  cardImage: string
  cardStyle: "modern" | "classic" | "minimal"
  buttons: ProButton[]
  mediaUrl: string
  mediaType: "image" | "video" | "audio"
  quickReplies: QuickReplyOption[]
  replyMode: "both" | "dm_only" | "public_only"
  typingIndicator: boolean
  captureName: boolean
  captureEmail: boolean
  capturePhone: boolean
  phoneScale: "mini" | "pro" | "pro-max"
  setPhoneScale: (s: "mini" | "pro" | "pro-max") => void
  platform: string
}

/* ── Helpers ── */

function incomingMsg(triggerSource: string, triggers: string[]): string {
  const primaryKw = triggers.length > 0 ? triggers[0] : null
  if (triggerSource === "comment") {
    return primaryKw ? `Commented "${primaryKw}"` : "Commented on post"
  }
  if (triggerSource === "story") {
    return "Interacted with your Story"
  }
  return primaryKw ? `DMed keyword "${primaryKw}"` : "Sent you a message"
}

function hasDMContent(
  type: string,
  messageText: string,
  cardTitle: string,
  mediaUrl: string
): boolean {
  if (type === "text" && messageText.trim().length > 0) return true
  if (type === "card" && cardTitle.trim().length > 0) return true
  if (type === "media" && mediaUrl.trim().length > 0) return true
  return false
}

/* ── Platform-specific preview brand colors ── */
const PLATFORM_PREVIEW: Record<string, { outgoing: string; headerLabel: string }> = {
  instagram: { outgoing: "bg-[#0095F6]", headerLabel: "Instagram" },
  messenger: { outgoing: "bg-[#0084FF]", headerLabel: "Messenger" },
  facebook:  { outgoing: "bg-[#1877F2]", headerLabel: "Facebook" },
  telegram:  { outgoing: "bg-[#2AABEE]", headerLabel: "Telegram" },
  whatsapp:  { outgoing: "bg-[#25D366]", headerLabel: "WhatsApp" },
}

/* ── Component ── */

export function RulePreviewPhone({
  userId,
  editRule,
  triggerSource,
  triggers,
  type,
  messageText,
  cardTitle,
  cardSubtitle,
  cardImage,
  cardStyle,
  buttons,
  mediaUrl,
  mediaType,
  quickReplies,
  replyMode,
  typingIndicator,
  captureName,
  captureEmail,
  capturePhone: capturePhoneField,
  phoneScale,
  setPhoneScale,
  platform,
}: RulePreviewPhoneProps) {
  if (replyMode === "public_only") return null

  const pv = PLATFORM_PREVIEW[platform] || PLATFORM_PREVIEW.instagram
  const outgoingBubble = pv.outgoing

  return (
    <div className="hidden lg:block sticky top-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="font-mono text-[10.5px] text-[var(--t3)] font-medium">
          Interactive preview
        </span>
        <div className="flex items-center gap-1 bg-[var(--s2)] p-0.5 rounded-md border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setPhoneScale("mini")}
            className={`px-2 py-0.5 text-[9.5px] font-medium rounded transition-colors cursor-pointer ${
              phoneScale === "mini" ? "bg-[var(--s3)] text-[var(--t1)]" : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Mini
          </button>
          <button
            type="button"
            onClick={() => setPhoneScale("pro")}
            className={`px-2 py-0.5 text-[9.5px] font-medium rounded transition-colors cursor-pointer ${
              phoneScale === "pro" ? "bg-[var(--s3)] text-[var(--t1)]" : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Pro
          </button>
          <button
            type="button"
            onClick={() => setPhoneScale("pro-max")}
            className={`px-2 py-0.5 text-[9.5px] font-medium rounded transition-colors cursor-pointer ${
              phoneScale === "pro-max"
                ? "bg-[var(--s3)] text-[var(--t1)]"
                : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Max
          </button>
        </div>
      </div>

      {/* iPhone Outer Frame */}
      <div
        className={`${
          phoneScale === "mini"
            ? "w-[280px] h-[520px]"
            : phoneScale === "pro"
            ? "w-[320px] h-[580px]"
            : "w-[380px] h-[680px]"
        } rounded-[3rem] border-8 border-[#1f1f1e] bg-black shadow-2xl relative flex flex-col overflow-hidden ring-1 ring-white/10 transition-all duration-300 hover:scale-[1.01] group`}
        style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
      >
        {/* Status Bar Mockup */}
        <div className="h-12 flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold text-white/90 z-40 select-none relative">
          <span className="w-14 text-center flex items-center justify-center">9:41</span>

          {/* Dynamic Island */}
          <div className="w-[120px] h-[32px] bg-black rounded-full z-50 flex items-center justify-between px-2.5 shadow-sm border border-white/5 ring-1 ring-black absolute left-1/2 -translate-x-1/2 top-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#111] border border-neutral-900/50" />
          </div>

          <div className="flex items-center gap-1.5 w-14 justify-center">
            <svg viewBox="0 0 18 12" className="w-3.5 h-3 fill-current opacity-90">
              <path d="M1 9h2V3H1v6zm3 0h2V1H4v8zm3 0h2V6H7v3zm3 0h2V4h-2v5zm3 0h2V7h-2v2z" />
            </svg>
            <svg viewBox="0 0 16 12" className="w-3.5 h-3 fill-current opacity-90">
              <path d="M8 2.2C5.5 2.2 3.3 3.3 1.8 4.9L8 11.8 14.2 4.9C12.7 3.3 10.5 2.2 8 2.2zM8 0c3.2 0 6 1.4 8 3.5L8 12 0 3.5C2 1.4 4.8 0 8 0z" />
            </svg>
            <div className="w-5 h-2.5 border border-white/40 rounded-[4px] p-[1px] flex items-center relative">
              <div className="w-[80%] h-full bg-white rounded-[2px]" />
              <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-1 bg-white/40 rounded-r-sm" />
            </div>
          </div>
        </div>

        {/* True-to-life DM Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black sticky top-0 z-40 mt-0">
          <div className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5 text-white cursor-pointer -ml-1" />
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800">
                  <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-white uppercase">
                    {(editRule?.name || "T").substring(0, 1)}
                  </div>
                </div>
                <div className="absolute bottom-0 -end-0.5 w-3 h-3 bg-[#31a24c] rounded-full border-2 border-black" />
              </div>
              <div className="leading-tight flex flex-col justify-center">
                <div className="flex items-center gap-1">
                  <p className="text-[14px] font-semibold text-white tracking-tight">
                    {userId ? "test_creator" : "creator"}
                  </p>
                  <svg className="w-3 h-3 text-[#0095F6] fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z" />
                  </svg>
                </div>
                <p className="text-[12px] text-neutral-500 font-medium tracking-tight">
                  {pv.headerLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-white pe-1">
            <Phone className="w-5 h-5" />
            <Video className="w-6 h-6" />
          </div>
        </div>

        {/* Screen Body */}
        <div className="flex-1 bg-black px-3 pt-4 pb-6 space-y-4 overflow-y-auto font-sans flex flex-col justify-end">
          {/* Incoming bubble */}
          <div className="flex justify-start items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-white shrink-0">
              U
            </div>
            <div className="bg-[#262626] text-white rounded-2xl rounded-bl-sm px-4 py-2.5 text-[14px] max-w-[75%] leading-snug">
              {incomingMsg(triggerSource, triggers)}
            </div>
          </div>

          {/* Typing indicator simulator */}
          {typingIndicator && (
            <div className="flex justify-end pe-1 animate-pulse">
              <span className="text-[9px] text-neutral-500 font-mono-ui italic">
                typing indicator active...
              </span>
            </div>
          )}

          {/* Lead Capture Sequence Simulator (Ordered: Name -> Phone -> Email) */}
          {captureName && (
            <>
              <div className="flex justify-end items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                <div className={`${outgoingBubble} text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px] max-w-[80%] leading-snug`}>
                  What is your name?
                </div>
              </div>
              <div className="flex justify-start items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-white shrink-0">
                  U
                </div>
                <div className="bg-[#262626] text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-[13px] max-w-[75%] leading-snug">
                  Customer Name
                </div>
              </div>
            </>
          )}

          {capturePhoneField && (
            <>
              <div className="flex justify-end items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                <div className={`${outgoingBubble} text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px] max-w-[80%] leading-snug`}>
                  What is your phone/WhatsApp number?
                </div>
              </div>
              <div className="flex justify-start items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-white shrink-0">
                  U
                </div>
                <div className="bg-[#262626] text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-[13px] max-w-[75%] leading-snug font-mono">
                  +966 50 123 4567
                </div>
              </div>
            </>
          )}

          {captureEmail && (
            <>
              <div className="flex justify-end items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                <div className={`${outgoingBubble} text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-[13px] max-w-[80%] leading-snug`}>
                  What is your email address?
                </div>
              </div>
              <div className="flex justify-start items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-white shrink-0">
                  U
                </div>
                <div className="bg-[#262626] text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-[13px] max-w-[75%] leading-snug">
                  customer@example.com
                </div>
              </div>
            </>
          )}

          {/* Outgoing Reply Bubble */}
          {hasDMContent(type, messageText, cardTitle, mediaUrl) ? (
            <div className="flex justify-end items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200 w-full">
              <div className="w-full flex flex-col items-end">
                {type === "text" && (
                  <div className={`${outgoingBubble} text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-[13.5px] whitespace-pre-wrap break-words leading-snug max-w-[85%]`}>
                    {messageText || "Type message content..."}
                  </div>
                )}
                {type === "card" && (
                  <div className="w-full flex justify-end">
                    <div className="bg-[#262626] rounded-2xl rounded-br-sm w-full max-w-[270px] overflow-hidden border border-white/10 shadow-md flex flex-col">
                      {/* Minimal style skips image */}
                      {cardStyle !== "minimal" && (
                        <div className={cardStyle === "classic" ? "flex flex-row items-center p-2.5 gap-2.5" : ""}>
                          {/* Image Area */}
                          {cardImage ? (
                            <img
                              src={cardImage}
                              alt="Card Preview"
                              className={
                                cardStyle === "classic"
                                  ? "w-14 h-14 rounded-lg object-cover shrink-0"
                                  : "w-full aspect-[1.91/1] object-cover"
                              }
                            />
                          ) : (
                            <div
                              className={`${
                                cardStyle === "classic" ? "w-14 h-14 rounded-lg" : "w-full aspect-[1.91/1]"
                              } bg-neutral-800 flex items-center justify-center shrink-0`}
                            >
                              <ImageIcon className="w-5 h-5 text-neutral-600" />
                            </div>
                          )}

                          {/* Text Area for Classic (Inline) */}
                          {cardStyle === "classic" && (
                            <div className="flex-1 min-w-0" dir="auto">
                              <div className="text-[13px] font-semibold text-white leading-snug line-clamp-2">
                                {cardTitle || "Card Title"}
                              </div>
                              {cardSubtitle && (
                                <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug line-clamp-2">
                                  {cardSubtitle}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Text Area for Modern / Minimal (Stacked) */}
                      {cardStyle !== "classic" && (
                        <div className="p-3 space-y-1" dir="auto">
                          <div className="text-[13.5px] font-semibold text-white leading-snug line-clamp-2">
                            {cardTitle || "Card Title"}
                          </div>
                          {cardSubtitle && (
                            <div className="text-[11.5px] text-neutral-400 leading-snug line-clamp-3">
                              {cardSubtitle}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Buttons Area */}
                      {buttons.length > 0 ? (
                        <div className="flex flex-col border-t border-white/10 divide-y divide-white/10">
                          {buttons
                            .filter((b) => b.title)
                            .map((b) => (
                              <div
                                key={b.id}
                                onClick={() => {
                                  if (b.url) window.open(b.url, "_blank")
                                }}
                                dir="auto"
                                className="text-center py-2 px-3 text-[13px] text-[#3897f0] font-semibold hover:bg-white/5 cursor-pointer transition-colors truncate"
                              >
                                {b.title}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="border-t border-white/10 text-center py-2 text-[13px] text-neutral-500 font-medium italic">
                          Button Link
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {type === "media" && (
                  <div className="bg-neutral-900 border border-white/10 rounded-2xl w-40 h-40 overflow-hidden flex items-center justify-center relative group shadow-xl">
                    {mediaType === "image" && mediaUrl.startsWith("http") ? (
                      <img src={mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-neutral-500">
                        <ImageIcon className="w-6 h-6" />
                        <span className="text-[9px] uppercase font-mono-ui tracking-wider">
                          {mediaType}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {type === "media" && messageText && (
                  <div className={`${outgoingBubble} text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-[14px] leading-snug`}>
                    {messageText}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-end animate-pulse">
              <div className="border border-dashed border-white/15 bg-white/[0.01] rounded-2xl px-4 py-3 text-[10px] text-neutral-500 font-mono-ui italic text-center w-full">
                Configure step 2 to build payload
              </div>
            </div>
          )}

          {/* Quick Reply Pills */}
          {type !== "card" && quickReplies.filter((q) => q.title.trim()).length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end pt-2">
              {quickReplies
                .filter((q) => q.title.trim())
                .map((q) => (
                  <span
                    key={q.id}
                    className="border border-[#3797f0] text-[#3797f0] hover:bg-[#3797f0]/5 cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition-all"
                  >
                    {q.title}
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* iPhone Footer Navigation Bar */}
        <div className="h-14 bg-black flex items-center justify-between px-3 text-white gap-3 pb-4 pt-1 border-t border-white/10">
          <div className="w-8 h-8 rounded-full bg-[#0095F6] flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 h-9 bg-[#262626] rounded-full px-4 flex items-center justify-between text-[13px] text-[#A8A8A8]">
            <span>Message...</span>
            <div className="flex items-center gap-3 text-white">
              <Mic className="w-4 h-4 opacity-80" />
              <svg
                aria-label="Sticker"
                className="w-5 h-5 opacity-80 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
          </div>
          <PicIcon className="w-6 h-6 shrink-0 opacity-90" />
        </div>

        {/* iPhone Bottom Bar Indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center z-50">
          <div className="w-32 h-1 bg-white/60 rounded-full" />
        </div>
      </div>
    </div>
  )
}
