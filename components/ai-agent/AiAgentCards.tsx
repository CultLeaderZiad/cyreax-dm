"use client"

import React, { useState, useEffect } from "react"
import { Bot, ShoppingCart, Star, Plus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Pill } from "@/components/ui/Pill"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

export interface AgentItem {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  status: "live" | "paused"
  channels: ChannelType[]
  dialects?: string
  scope: string
  isActive: boolean
  metrics: { label: string; value: string }[]
}

const initialAgents: AgentItem[] = [
  {
    id: "sales-assistant",
    name: "Sales assistant",
    icon: Bot,
    status: "live",
    channels: ["instagram", "whatsapp", "facebook"],
    dialects: "Egyptian · Gulf · English · Arabizi",
    scope: "Hands off on refunds, complaints",
    isActive: true,
    metrics: [
      { label: "Resolved alone", value: "71.4%" },
      { label: "Leads 7d", value: "318" },
      { label: "CSAT", value: "4.7 / 5" },
      { label: "Unknown answers", value: "7" },
    ],
  },
  {
    id: "order-tracker",
    name: "Order & delivery tracker",
    icon: ShoppingCart,
    status: "live",
    channels: ["whatsapp"],
    dialects: "",
    scope: 'Answers "where is my order" from Bosta tracking',
    isActive: true,
    metrics: [
      { label: "Answered 7d", value: "212" },
      { label: "No handoff", value: "96%" },
    ],
  },
  {
    id: "sentiment-watcher",
    name: "Comment sentiment watcher",
    icon: Star,
    status: "paused",
    channels: ["instagram"],
    dialects: "",
    scope: "Flags angry comments on tracked posts to the inbox",
    isActive: false,
    metrics: [],
  },
]

export function AiAgentCards({
  onNewAgent,
}: {
  onNewAgent?: () => void
}) {
  const [agents, setAgents] = useState<AgentItem[]>(initialAgents)
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null)
  const [editName, setEditName] = useState("")
  const [editScope, setEditScope] = useState("")

  useEffect(() => {
    fetch("/api/ai-agent/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings) {
          const isEnabled = Boolean(data.settings.enabled)
          setAgents((prev) =>
            prev.map((a) =>
              a.id === "sales-assistant"
                ? {
                    ...a,
                    isActive: isEnabled,
                    status: isEnabled ? "live" : "paused",
                    name: data.settings.personaName || a.name,
                    scope: data.settings.persona || a.scope,
                  }
                : a
            )
          )
        }
      })
      .catch(console.error)
  }, [])

  const handleToggle = async (id: string, checked: boolean) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              isActive: checked,
              status: checked ? "live" : "paused",
            }
          : a
      )
    )
    try {
      const res = await fetch("/api/ai-agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      })
      if (res.ok) {
        toast.success(checked ? "Agent activated and live" : "Agent paused")
      } else {
        toast.error("Failed to update AI Agent status")
      }
    } catch {
      toast.error("Network error updating AI Agent")
    }
  }

  const handleOpenEdit = (agent: AgentItem) => {
    setEditingAgent(agent)
    setEditName(agent.name)
    setEditScope(agent.scope)
  }

  const handleSaveEdit = async () => {
    if (!editingAgent) return
    try {
      const res = await fetch("/api/ai-agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaName: editName,
          persona: editScope,
          enabled: editingAgent.isActive,
        }),
      })
      if (res.ok) {
        toast.success("Agent settings updated")
      } else {
        toast.info("Agent settings saved locally")
      }
    } catch {
      toast.info("Agent settings saved locally")
    }
    setAgents((prev) =>
      prev.map((a) =>
        a.id === editingAgent.id ? { ...a, name: editName, scope: editScope } : a
      )
    )
    setEditingAgent(null)
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        badge="Agents"
        title="No AI agent yet"
        description="Create one to answer DMs from your knowledge."
        action={{
          label: "New agent",
          onClick: onNewAgent || (() => toast.info("Creating new AI Agent...")),
        }}
      />
    )
  }

  return (
    <div className="space-y-3 select-none">
      {agents.map((agent) => {
        const Icon = agent.icon
        return (
          <div
            key={agent.id}
            onClick={() => handleOpenEdit(agent)}
            className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 space-y-3.5 hover:border-[var(--line2)] hover:bg-[var(--s1)]/80 transition-colors cursor-pointer"
          >
            {/* Top row: Icon, Name, Status, Channels, Dialects, Toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)] shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[13.5px] font-semibold text-[var(--t1)]">
                      {agent.name}
                    </h3>
                    {agent.status === "live" ? (
                      <Pill variant="green" dot>
                        Live
                      </Pill>
                    ) : (
                      <Pill variant="neutral" dot={false}>
                        Paused
                      </Pill>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-[var(--t3)]">
                    {/* Channel badges */}
                    <div className="flex items-center gap-1">
                      {agent.channels.map((ch) => (
                        <ChannelBadge key={ch} channel={ch} size="sm" className="w-4 h-4 rounded-full" />
                      ))}
                    </div>

                    {agent.dialects && (
                      <>
                        <span>{agent.dialects}</span>
                        <span>·</span>
                      </>
                    )}

                    <span>{agent.scope}</span>
                  </div>
                </div>
              </div>

              <div
                className="shrink-0 pt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Switch
                  role="switch"
                  aria-label={agent.isActive ? `Pause ${agent.name}` : `Activate ${agent.name}`}
                  checked={agent.isActive}
                  onCheckedChange={(checked) => handleToggle(agent.id, checked)}
                />
              </div>
            </div>

            {/* Metrics row */}
            {agent.metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[var(--line)]">
                {agent.metrics.map((m) => (
                  <div key={m.label} className="text-start">
                    <div className="font-mono text-[13px] font-semibold text-[var(--t1)] tabular-nums">
                      {m.value}
                    </div>
                    <div className="text-[10.5px] text-[var(--t3)] font-mono">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Quick Agent Editor Dialog */}
      <Dialog open={Boolean(editingAgent)} onOpenChange={(open) => !open && setEditingAgent(null)}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Edit {editingAgent?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Adjust agent identity and routing handoff rules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Agent name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Handoff and scope instructions
              </label>
              <textarea
                rows={3}
                value={editScope}
                onChange={(e) => setEditScope(e.target.value)}
                className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-[6px] p-2 text-xs text-[var(--t1)] focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditingAgent(null)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveEdit}
              className="h-[28px] text-xs"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
