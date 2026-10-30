"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Sparkles,
  ShoppingCart,
  Bot,
  Plus,
  X,
  Check,
  User,
  FileText,
  Clock,
  Calendar,
  Mail,
  Phone,
  Link as LinkIcon,
  HelpCircle,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { toast } from "sonner"
import type { ContactRecord } from "@/lib/contacts"
import { displayName as getDisplayName } from "@/lib/ui/contactName"

type RailTab = "copilot" | "details" | "orders" | "notes"

interface ContactNote {
  id: string
  text: string
  author: string
  createdAt: string
}

interface CustomerCopilotRailProps {
  recipientName: string | null
  recipientId?: string
  platform: string
  contactContext?: {
    contact?: ContactRecord | null
    window?: { status?: string; remaining_ms?: number } | null
  } | null
  botPaused: boolean
  onToggleBot: () => void
  onInsertText?: (text: string) => void
}

const LEAD_STAGES = [
  { id: 1, label: "New Lead", key: "new" },
  { id: 2, label: "Engaged", key: "engaged" },
  { id: 3, label: "Proposal / Link Sent", key: "proposal" },
  { id: 4, label: "Closed / Won", key: "won" },
]

export function CustomerCopilotRail({
  recipientName,
  recipientId,
  platform,
  contactContext,
  botPaused,
  onToggleBot,
  onInsertText,
}: CustomerCopilotRailProps) {
  const contact = contactContext?.contact
  const [activeTab, setActiveTab] = useState<RailTab>("copilot")
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(contact?.tags || [])
  const [newNoteInput, setNewNoteInput] = useState("")

  // Lead stage state (1 to 4)
  const [stage, setStage] = useState<number>(() => {
    const customStage = contact?.custom_fields?.lead_stage
    if (customStage === "won" || customStage === "closed") return 4
    if (customStage === "proposal" || customStage === "link_sent") return 3
    if (customStage === "engaged" || customStage === "replied") return 2
    return 1
  })

  // Notes state
  const [notes, setNotes] = useState<ContactNote[]>(() => {
    if (contact?.custom_fields?.internal_notes) {
      try {
        const parsed = JSON.parse(contact.custom_fields.internal_notes)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return [
          {
            id: "initial",
            text: contact.custom_fields.internal_notes,
            author: "Team",
            createdAt: new Date().toISOString(),
          },
        ]
      }
    }
    return []
  })

  // Synchronize state when contact prop updates
  useEffect(() => {
    if (contact?.tags) {
      setTags(contact.tags)
    } else {
      setTags([])
    }

    if (contact?.custom_fields?.lead_stage) {
      const customStage = contact.custom_fields.lead_stage
      if (customStage === "won" || customStage === "closed") setStage(4)
      else if (customStage === "proposal" || customStage === "link_sent") setStage(3)
      else if (customStage === "engaged" || customStage === "replied") setStage(2)
      else setStage(1)
    }

    if (contact?.custom_fields?.internal_notes) {
      try {
        const parsed = JSON.parse(contact.custom_fields.internal_notes)
        if (Array.isArray(parsed)) setNotes(parsed)
      } catch {
        // Leave existing notes
      }
    }
  }, [contact?.id, contact?.tags, contact?.custom_fields])

  const handleAddTag = () => {
    if (!newTagInput.trim()) {
      setIsAddingTag(false)
      return
    }
    const clean = newTagInput.trim().toLowerCase()
    if (!tags.includes(clean)) {
      const updated = [...tags, clean]
      setTags(updated)
      if (contact?.id) {
        fetch(`/api/contacts/${contact.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: updated }),
        }).catch(() => {})
      }
      toast.success(`Tag "${clean}" added`)
    }
    setNewTagInput("")
    setIsAddingTag(false)
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove)
    setTags(updated)
    if (contact?.id) {
      fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updated }),
      }).catch(() => {})
    }
    toast.info(`Tag "${tagToRemove}" removed`)
  }

  const handleSetStage = (newStage: number) => {
    setStage(newStage)
    const stageObj = LEAD_STAGES.find((s) => s.id === newStage)
    if (contact?.id && stageObj) {
      fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_fields: {
            ...(contact.custom_fields || {}),
            lead_stage: stageObj.key,
          },
        }),
      }).catch(() => {})
    }
    toast.success(`Lead stage set to "${stageObj?.label}"`)
  }

  const handleSaveNote = () => {
    if (!newNoteInput.trim()) return
    const newNote: ContactNote = {
      id: Date.now().toString(),
      text: newNoteInput.trim(),
      author: "You",
      createdAt: new Date().toISOString(),
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    setNewNoteInput("")

    if (contact?.id) {
      fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_fields: {
            ...(contact.custom_fields || {}),
            internal_notes: JSON.stringify(updated),
          },
        }),
      }).catch(() => {})
    }
    toast.success("Internal note saved")
  }

  // Safe display name without leaking internal IDs or raw payloads
  const displayName = useMemo(() => {
    return getDisplayName(
      {
        display_name: contact?.display_name || recipientName,
        recipient_id: recipientId,
        platform,
      },
      "en"
    )
  }, [contact?.display_name, recipientName, recipientId, platform])

  const initials = useMemo(() => {
    return (
      displayName
        .replace(/[@_.]+/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("") || "CU"
    )
  }, [displayName])

  const sourceText = contact?.source || (platform ? `${platform} direct` : "Inbound conversation")
  const emailText = contact?.email || null
  const phoneText = contact?.phone || null

  return (
    <div className="w-full h-full flex flex-col bg-[var(--s1)] select-none">
      {/* Mini Customer Header Bar */}
      <div className="p-3.5 border-b border-[var(--line)] flex items-center justify-between gap-3 bg-[var(--s1)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[var(--s3)] border border-[var(--line2)] flex items-center justify-center font-mono text-[11.5px] font-semibold text-[var(--t1)] shrink-0 shadow-xs">
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-[var(--t1)] truncate leading-tight">
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ChannelBadge
                channel={(platform || contact?.channel || "instagram") as ChannelType}
                size="sm"
                className="w-3.5 h-3.5 rounded-full"
              />
              <span className="text-[10.5px] text-[var(--t3)] truncate font-mono">
                {recipientId ? `@${recipientId.slice(0, 16)}` : platform}
              </span>
            </div>
          </div>
        </div>

        {/* Bot active indicator */}
        <button
          type="button"
          onClick={onToggleBot}
          className={cn(
            "h-6 px-2 rounded-full text-[10px] font-mono font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0 border",
            botPaused
              ? "bg-[var(--red)]/10 text-[var(--red)] border-[var(--red)]/30 hover:bg-[var(--red)]/20"
              : "bg-[var(--green)]/10 text-[var(--green)] border-[var(--green)]/30 hover:bg-[var(--green)]/20"
          )}
          title={botPaused ? "AI is paused. Click to resume." : "AI is active. Click to pause."}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", botPaused ? "bg-[var(--red)]" : "bg-[var(--green)]")} />
          <span>{botPaused ? "Paused" : "AI Active"}</span>
        </button>
      </div>

      {/* 4 Tabs Navigation Bar */}
      <div className="flex items-center border-b border-[var(--line)] bg-[var(--s2)] p-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("copilot")}
          className={cn(
            "flex-1 py-1.5 px-1.5 rounded-[5px] text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer",
            activeTab === "copilot"
              ? "bg-[var(--s1)] text-[var(--gold)] shadow-xs border border-[var(--line)] font-semibold"
              : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
          )}
        >
          <Sparkles className="w-3 h-3 text-[var(--gold)] shrink-0" />
          <span>Copilot</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={cn(
            "flex-1 py-1.5 px-1.5 rounded-[5px] text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer",
            activeTab === "details"
              ? "bg-[var(--s1)] text-[var(--t1)] shadow-xs border border-[var(--line)] font-semibold"
              : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
          )}
        >
          <User className="w-3 h-3 text-[var(--t2)] shrink-0" />
          <span>Details</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={cn(
            "flex-1 py-1.5 px-1.5 rounded-[5px] text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer",
            activeTab === "orders"
              ? "bg-[var(--s1)] text-[var(--t1)] shadow-xs border border-[var(--line)] font-semibold"
              : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
          )}
        >
          <ShoppingCart className="w-3 h-3 text-[var(--t2)] shrink-0" />
          <span>Orders</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notes")}
          className={cn(
            "flex-1 py-1.5 px-1.5 rounded-[5px] text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer",
            activeTab === "notes"
              ? "bg-[var(--s1)] text-[var(--t1)] shadow-xs border border-[var(--line)] font-semibold"
              : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)]"
          )}
        >
          <FileText className="w-3 h-3 text-[var(--t2)] shrink-0" />
          <span>Notes</span>
          {notes.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-[var(--s3)] border border-[var(--line)] text-[9px] font-mono flex items-center justify-center text-[var(--t2)]">
              {notes.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)] scrollbar-track-transparent">
        {/* ================= TAB 1: COPILOT ================= */}
        {activeTab === "copilot" && (
          <div className="p-4 space-y-4">
            {/* AI Assistant Status & Quick Toggle */}
            <div className="p-3 rounded-[8px] bg-[var(--s2)] border border-[var(--line)] flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[var(--gold)]" />
                  <span className="text-[12px] font-medium text-[var(--t1)]">
                    {botPaused ? "Handed over to human" : "AI Agent active"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleBot}
                  className="text-[11px] font-medium text-[var(--gold)] hover:underline cursor-pointer"
                >
                  {botPaused ? "Resume AI" : "Pause AI"}
                </button>
              </div>
              <p className="text-[11px] text-[var(--t3)] leading-relaxed">
                {botPaused
                  ? "AI will not auto-respond. You have full manual control over this thread."
                  : "AI analyzes inbound customer messages and replies according to your automation rules."}
              </p>
            </div>

            {/* Conversation Insights */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[var(--gold)] font-semibold text-[11px] uppercase tracking-wider font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Conversation Insights</span>
              </div>
              <div className="p-3 rounded-[8px] bg-[var(--s2)] border border-[var(--line)] text-[11.5px] text-[var(--t2)] space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] mt-1.5 shrink-0" />
                  <span>
                    Channel: <strong className="text-[var(--t1)] capitalize">{platform || "Chat"}</strong> direct messaging.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] mt-1.5 shrink-0" />
                  <span>
                    Lead status: <strong className="text-[var(--t1)]">{LEAD_STAGES.find((s) => s.id === stage)?.label}</strong>.
                  </span>
                </div>
                {tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] mt-1.5 shrink-0" />
                    <span>
                      Active interests: <strong className="text-[var(--t1)]">{tags.join(", ")}</strong>.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Composer Actions */}
            <div className="space-y-2">
              <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                Quick Actions
              </span>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (onInsertText) {
                      onInsertText("Here is your secure payment checkout link: https://pay.cyreax.com/checkout")
                    }
                    toast.info("Payment link inserted into composer")
                  }}
                  className="w-full h-[32px] rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[11.5px] font-medium text-[var(--t1)] flex items-center gap-2 px-2.5 transition-colors cursor-pointer text-start"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
                  <span className="truncate">Insert Payment Link</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onInsertText) {
                      onInsertText("Could you please share your delivery address and contact phone number?")
                    }
                    toast.info("Address request inserted")
                  }}
                  className="w-full h-[32px] rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[11.5px] font-medium text-[var(--t1)] flex items-center gap-2 px-2.5 transition-colors cursor-pointer text-start"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
                  <span className="truncate">Request Shipping Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onInsertText) {
                      onInsertText("Let's schedule a call: https://cal.com/booking")
                    }
                    toast.info("Booking link inserted")
                  }}
                  className="w-full h-[32px] rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[11.5px] font-medium text-[var(--t1)] flex items-center gap-2 px-2.5 transition-colors cursor-pointer text-start"
                >
                  <Calendar className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
                  <span className="truncate">Send Booking Calendar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: DETAILS ================= */}
        {activeTab === "details" && (
          <div className="p-4 space-y-4">
            {/* Lead Stage Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                  Lead Stage
                </span>
                <span className="font-mono text-[11px] text-[var(--gold)]">
                  {stage} / 4 · {LEAD_STAGES.find((s) => s.id === stage)?.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {LEAD_STAGES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSetStage(s.id)}
                    className={cn(
                      "h-1.5 rounded-full transition-all cursor-pointer",
                      s.id <= stage ? "bg-[var(--gold)]" : "bg-[var(--s3)] hover:bg-[var(--line2)]"
                    )}
                    title={`Set stage: ${s.label}`}
                  />
                ))}
              </div>
            </div>

            {/* Tags Manager */}
            <div className="space-y-2 pt-2 border-t border-[var(--line)]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                  Contact Tags
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[var(--s2)] border border-[var(--line)] font-mono text-[11px] text-[var(--t2)] group"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="opacity-60 group-hover:opacity-100 hover:text-[var(--red)] transition-opacity cursor-pointer"
                      title={`Remove tag ${t}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}

                {isAddingTag ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTag()
                        if (e.key === "Escape") setIsAddingTag(false)
                      }}
                      autoFocus
                      placeholder="tag name..."
                      className="h-6 w-24 px-2 text-[11px] font-mono bg-[var(--s3)] border border-[var(--line2)] rounded-[4px] text-[var(--t1)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="p-1 text-[var(--green)] hover:text-white cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] border border-dashed border-[var(--line2)] hover:border-[var(--line3)] text-[11px] font-mono text-[var(--t3)] hover:text-[var(--t2)] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>tag</span>
                  </button>
                )}
              </div>
            </div>

            {/* Contact Attributes Table */}
            <div className="space-y-2 pt-2 border-t border-[var(--line)]">
              <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                Attributes
              </span>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--t3)]">Platform</span>
                  <div className="flex items-center gap-1.5">
                    <ChannelBadge
                      channel={(platform || contact?.channel || "instagram") as ChannelType}
                      size="sm"
                      className="w-3.5 h-3.5 rounded-full"
                    />
                    <span className="text-[var(--t1)] font-medium capitalize">{platform || "Chat"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--t3)]">Source</span>
                  <span className="text-[var(--t1)] font-medium text-end truncate max-w-[170px]">
                    {sourceText}
                  </span>
                </div>

                {emailText && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--t3)]">Email</span>
                    <span className="text-[var(--t1)] font-mono text-[11px] text-end truncate max-w-[170px]">
                      {emailText}
                    </span>
                  </div>
                )}

                {phoneText && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--t3)]">Phone</span>
                    <span className="text-[var(--t1)] font-mono text-[11px] text-end truncate max-w-[170px]">
                      {phoneText}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[var(--t3)]">External ID</span>
                  <span className="font-mono text-[10.5px] text-[var(--t3)] text-end truncate max-w-[170px]">
                    {recipientId || "—"}
                  </span>
                </div>

                {contact?.first_seen_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--t3)]">First seen</span>
                    <span className="font-mono text-[10.5px] text-[var(--t3)]">
                      {new Date(contact.first_seen_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: ORDERS ================= */}
        {activeTab === "orders" && (
          <div className="p-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center mb-3">
              <ShoppingCart className="w-5 h-5 text-[var(--t3)]" />
            </div>
            <h4 className="text-[13px] font-semibold text-[var(--t1)]">No orders yet</h4>
            <p className="text-[11.5px] text-[var(--t3)] mt-1.5 max-w-[220px] leading-relaxed">
              Generate a checkout payment link directly into the conversation to close a deal.
            </p>

            <button
              type="button"
              onClick={() => {
                if (onInsertText) {
                  onInsertText("https://pay.cyreax.com/checkout")
                }
                toast.success("Checkout link generated and copied to chat")
              }}
              className="mt-4 h-8 px-3 rounded-[6px] bg-[var(--gold)] text-black text-[11.5px] font-semibold hover:bg-[var(--gold2)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Create Payment Link</span>
            </button>
          </div>
        )}

        {/* ================= TAB 4: NOTES ================= */}
        {activeTab === "notes" && (
          <div className="p-4 space-y-4">
            {/* Note Input Composer */}
            <div className="space-y-2">
              <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                Internal Team Note
              </span>
              <textarea
                rows={2}
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                placeholder="Write a note about this customer (only visible to your team)..."
                className="w-full p-2.5 text-[12px] bg-[var(--s2)] border border-[var(--line)] rounded-[6px] text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:border-[var(--line2)] resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!newNoteInput.trim()}
                  className="h-7 px-2.5 rounded-[5px] bg-[var(--gold)] text-black text-[11px] font-medium hover:bg-[var(--gold2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Save Note</span>
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="space-y-2 pt-2 border-t border-[var(--line)]">
              <span className="font-mono uppercase tracking-wider text-[var(--t3)] font-semibold text-[10.5px]">
                Activity & Notes ({notes.length})
              </span>

              {notes.length === 0 ? (
                <div className="p-4 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] text-center text-[11.5px] text-[var(--t3)]">
                  No notes recorded yet. Add one above to keep your team synced.
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-2.5 rounded-[6px] bg-[var(--s2)] border border-[var(--line)] space-y-1 text-[11.5px]"
                    >
                      <div className="flex items-center justify-between text-[10px] text-[var(--t3)] font-mono">
                        <span className="font-semibold text-[var(--t2)]">{note.author}</span>
                        <span>{new Date(note.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-[var(--t1)] leading-relaxed whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
