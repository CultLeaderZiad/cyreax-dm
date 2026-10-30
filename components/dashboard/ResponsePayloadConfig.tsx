"use client"

import React from "react"
import {
  Plus, Trash2, MessageCircle, Link2, Image as ImageIcon,
  Loader2, Sparkles, X,
} from "lucide-react"
import { TagInput } from "@/components/ui/tag-input"
import type { ProButton, QuickReplyOption } from "@/lib/types"
import { cn } from "@/lib/utils"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] font-medium text-[var(--t3)] mb-1.5">
      {children}
    </p>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 bg-[var(--s2)] border border-[var(--line)] rounded-lg px-3 text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:border-[var(--line2)] transition-colors"
    />
  )
}

interface ResponsePayloadConfigProps {
  triggerSource: "comment" | "dm" | "story"
  replyMode: "both" | "dm_only" | "public_only"
  setReplyMode: (m: "both" | "dm_only" | "public_only") => void
  publicReplies: string[]
  setPublicReplies: (r: string[]) => void
  type: "text" | "card" | "media"
  setType: (t: "text" | "card" | "media") => void
  messageText: string
  setMessageText: (s: string) => void
  cardTitle: string
  setCardTitle: (s: string) => void
  cardSubtitle: string
  setCardSubtitle: (s: string) => void
  cardImage: string
  setCardImage: (s: string) => void
  cardStyle: "modern" | "classic" | "minimal"
  setCardStyle: (s: "modern" | "classic" | "minimal") => void
  buttons: ProButton[]
  addButton: () => void
  updateButton: (id: string, field: keyof ProButton, value: string) => void
  removeButton: (id: string) => void
  mediaUrl: string
  setMediaUrl: (s: string) => void
  mediaType: "image" | "video" | "audio"
  setMediaType: (t: "image" | "video" | "audio") => void
  quickReplies: QuickReplyOption[]
  addQuickReply: () => void
  updateQuickReply: (id: string, title: string) => void
  removeQuickReply: (id: string) => void
  variants: { id: string; text: string; weight: number }[]
  setVariants: (v: { id: string; text: string; weight: number }[]) => void
  /* AI copy */
  generatingCopy: boolean
  handleGenerateCopy: () => void
  copySuggestions: { id?: string; text: string }[]
  setCopySuggestions: (s: { id?: string; text: string }[]) => void
  handleAcceptCopy: (s: { id?: string; text: string }) => void
}

export function ResponsePayloadConfig({
  triggerSource,
  replyMode,
  setReplyMode,
  publicReplies,
  setPublicReplies,
  type,
  setType,
  messageText,
  setMessageText,
  cardTitle,
  setCardTitle,
  cardSubtitle,
  setCardSubtitle,
  cardImage,
  setCardImage,
  cardStyle,
  setCardStyle,
  buttons,
  addButton,
  updateButton,
  removeButton,
  mediaUrl,
  setMediaUrl,
  mediaType,
  setMediaType,
  quickReplies,
  addQuickReply,
  updateQuickReply,
  removeQuickReply,
  variants,
  setVariants,
  generatingCopy,
  handleGenerateCopy,
  copySuggestions,
  setCopySuggestions,
  handleAcceptCopy,
}: ResponsePayloadConfigProps) {
  return (
    <>
      {triggerSource === "comment" && (
        <div className="space-y-2">
          <FieldLabel>Flow direction</FieldLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { key: "both" as const, label: "Reply + DM" },
              { key: "public_only" as const, label: "Reply only" },
              { key: "dm_only" as const, label: "DM only" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setReplyMode(key)}
                className={cn(
                  "h-9 rounded-[7px] border text-xs font-medium transition-colors cursor-pointer",
                  replyMode === key
                    ? "border-[var(--goldline)] bg-[var(--goldbg)] text-[var(--gold2)]"
                    : "border-[var(--line)] bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {triggerSource === "comment" && replyMode !== "dm_only" && (
        <div className="space-y-2 bg-[var(--s1)] p-4 rounded-xl border border-[var(--line)]">
          <FieldLabel>Public comments rotation</FieldLabel>
          <p className="text-[11.5px] text-[var(--t3)] mb-2">
            Add multiple phrases. We rotate them dynamically to look natural.
          </p>
          <TagInput
            value={publicReplies}
            onChange={setPublicReplies}
            placeholder={'e.g. "Sent you a DM!", "Check your inbox!"'}
          />
        </div>
      )}

      {replyMode !== "public_only" && (
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <FieldLabel>Direct message format</FieldLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { key: "text" as const, icon: <MessageCircle className="w-4 h-4" />, label: "Text only" },
                { key: "card" as const, icon: <Link2 className="w-4 h-4" />, label: "Card / link" },
                { key: "media" as const, icon: <ImageIcon className="w-4 h-4" />, label: "Rich media" },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={cn(
                    "p-2.5 rounded-[7px] border text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer",
                    type === key
                      ? "border-[var(--goldline)] bg-[var(--goldbg)] text-[var(--gold2)]"
                      : "border-[var(--line)] bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
                  )}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Text message ── */}
          {type === "text" && (
            <div className="space-y-2">
              <FieldLabel>DM message text</FieldLabel>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
                maxLength={1000}
                className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-xl px-3.5 py-3 text-xs text-[var(--t1)] placeholder:text-[var(--t4)] resize-none focus:outline-none focus:border-[var(--line2)] transition-colors"
                placeholder="Type the message to send in DMs..."
              />
              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  onClick={handleGenerateCopy}
                  disabled={generatingCopy || !messageText}
                  className="flex items-center gap-1.5 text-xs text-[var(--gold2)] hover:text-white transition-colors bg-[var(--goldbg)] border border-[var(--goldline)] px-3 py-1 rounded-[6px] disabled:opacity-50 cursor-pointer"
                >
                  {generatingCopy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                  )}
                  <span>Generate AI alternatives</span>
                </button>
                <p className="font-mono text-[10.5px] text-[var(--t4)] text-end">
                  {messageText.length}/1000
                </p>
              </div>

              {copySuggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--t3)] px-1">
                    <span>AI suggestions</span>
                    <button
                      type="button"
                      onClick={() => setCopySuggestions([])}
                      className="hover:text-[var(--t1)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {copySuggestions.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 bg-[var(--s2)] p-3 rounded-lg border border-[var(--line)] transition-colors"
                    >
                      <p className="text-xs text-[var(--t2)] leading-relaxed">{s.text}</p>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleAcceptCopy(s)}
                          className="text-[11px] font-semibold text-black bg-[var(--gold)] px-3 py-1 rounded-[5px] hover:brightness-105 cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Card ── */}
          {type === "card" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <FieldLabel>Card configuration</FieldLabel>
                <div className="flex gap-1.5 bg-[var(--s2)] p-1 rounded-lg w-max border border-[var(--line)] mb-2">
                  {(["modern", "classic", "minimal"] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCardStyle(style)}
                      className={cn(
                        "px-2.5 py-1 rounded-[5px] text-[11px] font-medium transition-colors cursor-pointer",
                        cardStyle === style
                          ? "bg-[var(--s3)] text-[var(--t1)]"
                          : "text-[var(--t3)] hover:text-[var(--t1)]"
                      )}
                    >
                      {style}
                    </button>
                  ))}
                </div>
                <TextField value={cardTitle} onChange={setCardTitle} placeholder="Card main title" />
                <TextField
                  value={cardSubtitle}
                  onChange={setCardSubtitle}
                  placeholder="Subtitle description (optional)"
                />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                  <FieldLabel>Interactive buttons ({buttons.length}/3)</FieldLabel>
                  <button
                    type="button"
                    onClick={addButton}
                    disabled={buttons.length >= 3}
                    className="font-mono text-[11px] text-[var(--t3)] hover:text-[var(--t1)] disabled:opacity-40 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add button
                  </button>
                </div>
                {buttons.map((btn) => (
                  <div
                    key={btn.id}
                    className="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-[var(--s1)] p-3 rounded-xl border border-[var(--line)]"
                  >
                    <input
                      value={btn.title}
                      onChange={(e) => updateButton(btn.id, "title", e.target.value)}
                      className="h-8 text-xs w-full sm:flex-1 bg-[var(--s2)] border border-[var(--line)] rounded-md px-2.5 text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none"
                      placeholder="Button label"
                    />
                    <select
                      value={btn.type}
                      onChange={(e) => updateButton(btn.id, "type", e.target.value)}
                      className="h-8 text-[11px] w-full sm:w-auto bg-[var(--s2)] border border-[var(--line)] rounded-md px-2 text-[var(--t2)] focus:outline-none"
                    >
                      <option value="web_url">Open link</option>
                      <option value="postback">Trigger flow</option>
                    </select>
                    <div className="flex gap-2 w-full sm:flex-1">
                      <input
                        value={btn.type === "web_url" ? btn.url : btn.payload}
                        onChange={(e) =>
                          updateButton(btn.id, btn.type === "web_url" ? "url" : "payload", e.target.value)
                        }
                        className="h-8 text-xs w-full bg-[var(--s2)] border border-[var(--line)] rounded-md px-2.5 text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none font-mono"
                        placeholder={btn.type === "web_url" ? "https://link" : "flow_keyword"}
                      />
                      <button
                        type="button"
                        onClick={() => removeButton(btn.id)}
                        className="text-[var(--t3)] hover:text-[var(--red)] p-1.5 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Media ── */}
          {type === "media" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Select file type</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {(["image", "video", "audio"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMediaType(m)}
                      className={cn(
                        "h-9 rounded-[7px] border text-xs font-medium transition-colors cursor-pointer",
                        mediaType === m
                          ? "border-[var(--goldline)] bg-[var(--goldbg)] text-[var(--gold2)]"
                          : "border-[var(--line)] bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
                      )}
                    >
                      {m === "image" ? "Photo" : m === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>
              </div>
              <TextField
                value={mediaUrl}
                onChange={setMediaUrl}
                placeholder="Link to public media file (e.g. mp4, jpg)"
              />
              <TextField
                value={messageText}
                onChange={setMessageText}
                placeholder="Optional caption message to send after..."
              />
            </div>
          )}

          {/* ── Quick Reply Chips ── */}
          {type !== "card" && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                <FieldLabel>Quick reply chips ({quickReplies.length}/4)</FieldLabel>
                <button
                  type="button"
                  onClick={addQuickReply}
                  disabled={quickReplies.length >= 4}
                  className="font-mono text-[11px] text-[var(--t3)] hover:text-[var(--t1)] disabled:opacity-40 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add chip
                </button>
              </div>
              {quickReplies.length > 0 && (
                <div className="space-y-2">
                  {quickReplies.map((q) => (
                    <div key={q.id} className="flex gap-2 items-center">
                      <input
                        value={q.title}
                        onChange={(e) => updateQuickReply(q.id, e.target.value)}
                        maxLength={20}
                        className="h-9 text-xs flex-1 bg-[var(--s2)] border border-[var(--line)] rounded-lg px-3 text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none"
                        placeholder='e.g. "Send details!"'
                      />
                      <button
                        type="button"
                        onClick={() => removeQuickReply(q.id)}
                        className="text-[var(--t3)] hover:text-[var(--red)] p-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── A/B Testing Variants ── */}
          <div className="space-y-3 pt-2 border-t border-[var(--line)] mt-6">
            <div className="flex items-center justify-between pb-2">
              <FieldLabel>A/B test variants (optional)</FieldLabel>
              <button
                type="button"
                onClick={() =>
                  setVariants([...variants, { id: "new_" + Date.now(), text: "", weight: 20 }])
                }
                className="font-mono text-[11px] text-[var(--gold)] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add variant
              </button>
            </div>
            {variants.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11.5px] text-[var(--t3)]">
                  Default response receives{" "}
                  {100 - variants.reduce((sum, v) => sum + (v.weight || 0), 0)}% of traffic.
                </p>
                {variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex gap-2 items-start bg-[var(--s1)] p-3 rounded-xl border border-[var(--line)]"
                  >
                    <div className="flex-1 space-y-2">
                      <textarea
                        value={v.text}
                        onChange={(e) =>
                          setVariants(
                            variants.map((varnt) =>
                              varnt.id === v.id ? { ...varnt, text: e.target.value } : varnt
                            )
                          )
                        }
                        rows={2}
                        className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-lg px-3 py-2 text-xs text-[var(--t1)] placeholder:text-[var(--t4)] resize-none focus:outline-none"
                        placeholder="Alternative message text..."
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] text-[var(--t3)] font-mono">
                          Traffic weight (%)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={v.weight}
                          onChange={(e) =>
                            setVariants(
                              variants.map((varnt) =>
                                varnt.id === v.id
                                  ? { ...varnt, weight: parseInt(e.target.value) || 0 }
                                  : varnt
                              )
                            )
                          }
                          className="w-16 bg-[var(--s2)] border border-[var(--line)] rounded px-2 py-1 text-xs text-[var(--t1)]"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVariants(variants.filter((varnt) => varnt.id !== v.id))}
                      className="text-[var(--t3)] hover:text-[var(--red)] p-1 transition-colors mt-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
