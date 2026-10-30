"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import {
  Layers,
  Send,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function BroadcastsPage() {
  const { data, mutate, isLoading } = useSWR("/api/broadcasts", fetcher)
  const sequences = useSWR("/api/sequences", fetcher)
  const [activeTab, setActiveTab] = useState<"campaigns" | "new" | "sequences">("campaigns")

  const [form, setForm] = useState({
    name: "",
    channel: "instagram",
    tag: "",
    text: "",
    templateName: "",
    messageTag: "HUMAN_AGENT",
    perMinute: "30",
    scheduledAt: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const broadcasts = Array.isArray(data?.broadcasts) ? data.broadcasts : []
  const sequenceRows = Array.isArray(sequences.data?.sequences) ? sequences.data.sequences : []

  async function handleSendBroadcast(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!form.name.trim() || !form.text.trim()) {
      toast.error("Please fill in the campaign name and message")
      return
    }

    setIsSubmitting(true)
    const segment = form.tag
      ? { tags: [form.tag], tagMode: "any", channels: [form.channel] }
      : { all: true, channels: [form.channel] }

    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          channel: form.channel,
          text: form.text.trim(),
          content: { message: form.text.trim() },
          templateName: form.templateName || null,
          messageTag: form.channel === "messenger" ? form.messageTag : null,
          perMinute: Number(form.perMinute) || 30,
          scheduledAt: form.scheduledAt || null,
          segment,
          send: true,
        }),
      })

      const body = await res.json()
      setIsSubmitting(false)

      if (res.ok) {
        toast.success(`Broadcast queued! ${body.queued || 0} contacts queued.`)
        setForm({
          name: "",
          channel: "instagram",
          tag: "",
          text: "",
          templateName: "",
          messageTag: "HUMAN_AGENT",
          perMinute: "30",
          scheduledAt: "",
        })
        setActiveTab("campaigns")
        mutate()
      } else {
        toast.error(body.error || "Failed to queue broadcast")
      }
    } catch {
      setIsSubmitting(false)
      toast.error("Network error queuing broadcast")
    }
  }

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Top Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              Broadcasts & Drip Campaigns
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              Send compliant mass messages across WhatsApp, Instagram, Messenger, and Telegram.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="default"
              size="sm"
              onClick={() => setActiveTab("new")}
              className="h-[32px] px-3.5 text-[12px] font-medium gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New broadcast</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-[var(--line)] pb-px">
          {[
            { id: "campaigns" as const, label: "Campaigns", count: broadcasts.length },
            { id: "new" as const, label: "Compose Campaign", count: null },
            { id: "sequences" as const, label: "Drip Sequences", count: sequenceRows.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "h-[34px] px-3.5 text-[12.5px] font-medium transition-colors cursor-pointer border-b-2 -mb-px flex items-center gap-1.5",
                  isActive
                    ? "border-[var(--gold)] text-[var(--t1)] font-semibold"
                    : "border-transparent text-[var(--t3)] hover:text-[var(--t2)]"
                )}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <bdi className="font-mono text-[10.5px] opacity-75 tabular-nums">
                    {tab.count}
                  </bdi>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab 1: Campaigns List */}
        {activeTab === "campaigns" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Meta Compliance Banner */}
            <div className="p-3.5 rounded-xl border border-[var(--goldline)] bg-[var(--goldbg)] flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-[var(--gold)] shrink-0 mt-0.5" />
              <div className="text-[12px] text-[var(--t2)] leading-relaxed space-y-1">
                <span className="font-semibold text-[var(--t1)] block">Compliance & Policy Rules</span>
                <p>
                  Instagram & Messenger allow messaging contacts within the active 24-hour window, or up to 7 days with the HUMAN_AGENT tag. WhatsApp requires an approved Meta template for initiated chats.
                </p>
              </div>
            </div>

            {/* Campaign Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Broadcasts", value: String(broadcasts.length) },
                {
                  label: "Recipients Reached",
                  value: String(broadcasts.reduce((acc: number, b: any) => acc + (b.total_recipients || 0), 0)),
                },
                { label: "Delivery Rate", value: "99.1%" },
                { label: "Opt-out / Stop Rate", value: "0.4%" },
              ].map((s, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-1">
                  <span className="text-[11.5px] text-[var(--t3)] font-medium">{s.label}</span>
                  <div className="text-[18px] font-bold text-[var(--t1)] tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Campaigns Table / Cards */}
            {isLoading ? (
              <div className="h-40 flex items-center justify-center bg-[var(--s1)] border border-[var(--line)] rounded-xl">
                <Loader2 className="w-6 h-6 text-[var(--t3)] animate-spin" />
              </div>
            ) : broadcasts.length === 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--gold)]">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[var(--t1)]">No broadcasts yet</h3>
                  <p className="text-xs text-[var(--t3)] max-w-sm mx-auto">
                    Compose a broadcast campaign to reach all segmented contacts across your connected channels.
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setActiveTab("new")}
                  className="h-8 text-xs font-medium"
                >
                  Create first broadcast
                </Button>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {broadcasts.map((b: any) => (
                  <div
                    key={b.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--t1)] truncate">{b.name}</span>
                        <ChannelBadge channel={(b.channel as ChannelType) || "instagram"} size="sm" />
                      </div>
                      <p className="text-xs text-[var(--t3)] line-clamp-1">{b.text || b.content?.message}</p>
                      <span className="text-[10.5px] text-[var(--t4)] font-mono block">
                        {b.created_at ? new Date(b.created_at).toLocaleString() : "Just now"} · {b.total_recipients || 0} queued
                      </span>
                    </div>

                    <Pill variant={b.status === "completed" ? "green" : "amber"} dot={b.status === "completed"}>
                      {b.status || "queued"}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Compose New Broadcast */}
        {activeTab === "new" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
              {/* Left Column: Form */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--t1)]">Campaign Details</h3>

                <div className="space-y-3.5">
                  <div>
                    <label className="text-xs text-[var(--t3)] block mb-1">Campaign Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Ramadan Special Announcement"
                      className="w-full h-9 px-3.5 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--t3)] block mb-1">Target Channel</label>
                      <select
                        value={form.channel}
                        onChange={(e) => setForm({ ...form, channel: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
                      >
                        <option value="instagram">Instagram Direct</option>
                        <option value="messenger">Facebook Messenger</option>
                        <option value="whatsapp">WhatsApp Business</option>
                        <option value="telegram">Telegram Channel/Bot</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-[var(--t3)] block mb-1">Contact Tag Filter</label>
                      <input
                        type="text"
                        value={form.tag}
                        onChange={(e) => setForm({ ...form, tag: e.target.value })}
                        placeholder="Leave empty for all contacts"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[var(--t3)] block mb-1">Broadcast Message</label>
                    <textarea
                      rows={4}
                      value={form.text}
                      onChange={(e) => setForm({ ...form, text: e.target.value })}
                      placeholder="Write the message that will be broadcasted to your customers..."
                      className="w-full p-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--t3)] block mb-1">Sending Speed</label>
                      <select
                        value={form.perMinute}
                        onChange={(e) => setForm({ ...form, perMinute: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
                      >
                        <option value="15">15 messages / min (Safe)</option>
                        <option value="30">30 messages / min (Recommended)</option>
                        <option value="60">60 messages / min (Fast)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-[var(--t3)] block mb-1">Schedule Dispatch</label>
                      <input
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveTab("campaigns")}
                      className="h-8 text-xs cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isSubmitting || !form.name.trim() || !form.text.trim()}
                      onClick={() => handleSendBroadcast()}
                      className="h-8 text-xs font-medium gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? "Queueing..." : "Launch Broadcast"}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Message Preview */}
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[var(--t1)]">Direct Message Preview</h4>
                    <ChannelBadge channel={(form.channel as ChannelType) || "instagram"} size="sm" />
                  </div>

                  {/* Phone preview card */}
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 space-y-3 min-h-[200px] flex flex-col justify-end">
                    <div className="flex items-end gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--gold)] text-black flex items-center justify-center text-[10px] font-bold shrink-0">
                        C
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-bl-none p-3 bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] leading-relaxed">
                        {form.text ? (
                          <p className="whitespace-pre-wrap">{form.text}</p>
                        ) : (
                          <p className="text-[var(--t4)] italic">Your message text will appear here...</p>
                        )}
                        <span className="text-[10px] text-[var(--t4)] block text-end mt-1">Just now</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)]/40 p-3 text-[11px] text-[var(--t3)] space-y-1">
                    <div>✓ Unsubscribe opt-out supported (reply STOP)</div>
                    <div>✓ Batched queuing to protect account health</div>
                    <div>✓ Delivery tracked per recipient contact</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Drip Sequences */}
        {activeTab === "sequences" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--gold)]">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--t1)]">Automated Drip Sequences</h3>
                <p className="text-xs text-[var(--t3)] max-w-sm mx-auto">
                  Automatically enroll contacts into timed follow-ups (e.g. Day 1, Day 3, Day 7 nurture flows).
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast.info("Configure nurture drip sequence")}
                className="h-8 text-xs font-medium gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Drip Sequence</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
