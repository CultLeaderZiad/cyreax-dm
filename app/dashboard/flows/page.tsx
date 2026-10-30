"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import {
  Workflow,
  Plus,
  Search,
  Zap,
  ArrowRight,
  Loader2,
  Layers,
  Sparkles,
  CheckCircle2,
  Play,
  Copy,
  Trash2,
  ExternalLink,
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
import Link from "next/link"

const FLOW_TEMPLATES = [
  {
    name: "Comment to DM Lead Magnet",
    channel: "instagram" as ChannelType,
    description: "Auto-reply to reel comments with an instant DM delivering a discount code or PDF guide.",
    trigger: "New Reel/Post Comment",
  },
  {
    name: "Customer Support & FAQ Navigator",
    channel: "messenger" as ChannelType,
    description: "Interactive button menu answering shipping, returns, and payment options automatically.",
    trigger: "First Message in DM",
  },
  {
    name: "Order Tracking & Status Inquiry",
    channel: "whatsapp" as ChannelType,
    description: "Collects customer phone or order ID and returns live shipment tracking from carrier.",
    trigger: 'Keyword: "فين طلبي" / "Track order"',
  },
  {
    name: "VIP Buyer Qualification Funnel",
    channel: "instagram" as ChannelType,
    description: "Asks 3 qualifying questions (budget, timeline, location) and alerts human agent on match.",
    trigger: "Keyword: VIP / حجز",
  },
]

export default function FlowsPage() {
  const { data, mutate, isLoading } = useSWR("/api/flows", fetcher)
  const [search, setSearch] = useState("")
  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const [isNewOpen, setIsNewOpen] = useState(false)
  const [newFlowName, setNewFlowName] = useState("")
  const [newFlowChannel, setNewFlowChannel] = useState("instagram")
  const [busy, setBusy] = useState(false)

  const flows = Array.isArray(data?.flows) ? data.flows : []

  async function createFlow(customName?: string, customChannel?: string) {
    const name = (customName || newFlowName || "New Flow").trim()
    const channel = customChannel || newFlowChannel
    setBusy(true)

    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, channel }),
      })
      const body = await res.json()
      setBusy(false)
      if (res.ok && body.id) {
        toast.success(`Flow "${name}" created`)
        window.location.href = `/dashboard/flows/${body.id}`
      } else {
        toast.error(body.error || "Failed to create flow")
      }
    } catch {
      setBusy(false)
      toast.error("Network error creating flow")
    }
  }

  const filteredFlows = flows.filter((f: any) => {
    const matchesSearch = f.name?.toLowerCase().includes(search.toLowerCase())
    const matchesChannel = selectedChannel === "all" || f.channel === selectedChannel
    return matchesSearch && matchesChannel
  })

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Top Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              Visual Flows
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              Build drag-and-drop conversation funnels and automated branching logic.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsNewOpen(true)}
              className="h-[32px] px-3.5 text-[12px] font-medium gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create flow</span>
            </Button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Flows", value: String(flows.length), change: "Configured" },
            {
              label: "Live & Active",
              value: String(flows.filter((f: any) => f.status === "live").length),
              change: "Serving customers",
            },
            { label: "Active Channels", value: "3", change: "IG, Messenger, WA" },
            { label: "Average Completion", value: "88.2%", change: "+4.1% this week" },
          ].map((stat, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--s1)] space-y-1"
            >
              <span className="text-[11.5px] text-[var(--t3)] font-medium">{stat.label}</span>
              <div className="text-[20px] font-bold text-[var(--t1)] tabular-nums">{stat.value}</div>
              <span className="text-[10.5px] text-[var(--gold)] font-medium block">{stat.change}</span>
            </div>
          ))}
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: "all", label: "All channels" },
              { id: "instagram", label: "Instagram" },
              { id: "messenger", label: "Messenger" },
              { id: "whatsapp", label: "WhatsApp" },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedChannel(c.id)}
                className={cn(
                  "h-7 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer",
                  selectedChannel === c.id
                    ? "bg-[var(--goldbg)] text-[var(--gold)] border border-[var(--goldline)]"
                    : "bg-[var(--s1)] text-[var(--t3)] hover:text-[var(--t1)] border border-[var(--line)]"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[var(--t3)] absolute start-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flows..."
              className="w-full h-8 ps-8 pe-3 bg-[var(--s1)] border border-[var(--line)] rounded-lg text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="h-48 flex items-center justify-center bg-[var(--s1)] border border-[var(--line)] rounded-xl">
            <Loader2 className="w-6 h-6 text-[var(--t3)] animate-spin" />
          </div>
        )}

        {/* Flows List */}
        {!isLoading && filteredFlows.length > 0 && (
          <div className="grid gap-2.5">
            {filteredFlows.map((flow: any) => (
              <div
                key={flow.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between gap-4 transition-colors hover:border-[var(--line3)] group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)] shrink-0">
                    <Workflow className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/flows/${flow.id}`}
                        className="text-sm font-semibold text-[var(--t1)] hover:text-[var(--gold)] transition-colors truncate"
                      >
                        {flow.name}
                      </Link>
                      <ChannelBadge
                        channel={(flow.channel as ChannelType) || "instagram"}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--t3)]">
                      <span>Trigger: {flow.trigger?.type || "Keyword / DM"}</span>
                      <span>·</span>
                      <span>
                        Updated {flow.updated_at ? new Date(flow.updated_at).toLocaleDateString() : "recently"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Pill variant={flow.status === "live" ? "green" : "neutral"} dot={flow.status === "live"}>
                    {flow.status === "live" ? "Live" : "Draft"}
                  </Pill>
                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="h-7 text-xs font-medium cursor-pointer"
                  >
                    <Link href={`/dashboard/flows/${flow.id}`}>Edit Canvas</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pre-built Templates Gallery */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-sm font-semibold text-[var(--t1)]">Quick-start templates</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FLOW_TEMPLATES.map((tmpl, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex flex-col justify-between space-y-3 hover:border-[var(--goldline)] transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[var(--t1)]">{tmpl.name}</h4>
                    <ChannelBadge channel={tmpl.channel} size="sm" />
                  </div>
                  <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">{tmpl.description}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                  <span className="text-[10.5px] text-[var(--t4)] font-mono">{tmpl.trigger}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => createFlow(tmpl.name, tmpl.channel)}
                    className="h-6 text-xs text-[var(--gold)] hover:text-[var(--gold2)] hover:bg-[var(--goldbg)] px-2 gap-1"
                  >
                    <span>Use template</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Flow Modal */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[var(--gold)]" />
              <span>Create New Flow</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Build an automated conversation tree with nodes, triggers, and branches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs text-[var(--t3)] block mb-1">Flow Name</label>
              <input
                type="text"
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder="e.g. Black Friday Reel Offer"
                className="w-full h-8 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--t3)] block mb-1">Target Channel</label>
              <select
                value={newFlowChannel}
                onChange={(e) => setNewFlowChannel(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
              >
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsNewOpen(false)}
              className="h-8 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={busy}
              onClick={() => createFlow()}
              className="h-8 text-xs font-medium cursor-pointer"
            >
              {busy ? "Creating..." : "Create & Open Canvas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
