"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Plus, Loader2, Play, Bot, Sparkles, Check, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AiAgentCards } from "@/components/ai-agent/AiAgentCards"
import { ReelOrderFunnel } from "@/components/ai-agent/ReelOrderFunnel"
import { KnowledgePanel } from "@/components/ai-agent/KnowledgePanel"
import { ModelKeyPicker } from "@/components/ai-agent/ModelKeyPicker"
import { UnansweredQuestions } from "@/components/ai-agent/UnansweredQuestions"
import { AnalyticsDashboardView } from "@/components/dashboard/AnalyticsDashboardView"
import { AiPlaygroundDialog } from "@/components/ai-agent/AiPlaygroundDialog"
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
import { BRAND } from "@/lib/brand"

type TabKey = "agents" | "knowledge" | "insights" | "models"

function resolveTab(raw: string | null): TabKey {
  if (raw === "knowledge") return "knowledge"
  if (raw === "insights" || raw === "analytics") return "insights"
  if (raw === "models" || raw === "model-keys" || raw === "model" || raw === "byok") return "models"
  return "agents"
}

function AiAgentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams?.get("tab")
  const [activeTab, setActiveTab] = useState<TabKey>(resolveTab(rawTab))
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false)
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState("")
  const [newAgentRole, setNewAgentRole] = useState("Sales & Inquiries")
  const [newAgentTone, setNewAgentTone] = useState("friendly")

  // Redirect legacy bookmarks
  useEffect(() => {
    const tab = searchParams?.get("tab")
    if (tab === "coach") {
      router.replace("/dashboard")
    } else if (tab === "content" || tab === "ice-breakers") {
      router.replace("/dashboard/automations")
    } else if (tab === "analytics") {
      handleTabChange("insights")
    } else if (tab === "model-keys" || tab === "model" || tab === "byok") {
      handleTabChange("models")
    } else if (tab && resolveTab(tab) !== activeTab) {
      setActiveTab(resolveTab(tab))
    }
  }, [searchParams])

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key)
    const params = new URLSearchParams(window.location.search)
    params.set("tab", key)
    router.replace(`/dashboard/ai-engine?${params.toString()}`, { scroll: false })
  }

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) {
      toast.error("Please enter an agent name")
      return
    }
    try {
      const res = await fetch("/api/ai-agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaName: newAgentName.trim(),
          persona: `You are the ${newAgentRole} assistant. Answer questions concisely using workspace knowledge.`,
          tone: newAgentTone,
          enabled: true,
        }),
      })
      if (res.ok) {
        toast.success(`Agent "${newAgentName}" configured and activated!`)
        setIsNewAgentOpen(false)
        setNewAgentName("")
      } else {
        toast.error("Failed to create agent")
      }
    } catch {
      toast.error("Network error creating agent")
    }
  }

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      {/* Main Container */}
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)]">
        {/* Header with Title and Actions */}
        <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              AI Agent
            </h1>
            <p className="text-[12.5px] text-[var(--t3)]">
              Agents answer DMs in the customer's dialect, using only this workspace's knowledge.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsPlaygroundOpen(true)}
              className="h-[32px] px-3.5 text-[12px] font-medium gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-[var(--gold)] fill-current" />
              <span>Test in playground</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => setIsNewAgentOpen(true)}
              className="h-[32px] px-3.5 text-[12px] font-medium gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New agent</span>
            </Button>
          </div>
        </div>

        {/* 4 Tabs Navigation: Agents · Knowledge · Insights · Model & keys */}
        <div className="flex items-center gap-1 border-b border-[var(--line)] pb-px">
          {[
            { id: "agents" as const, label: "Agents", count: "3" },
            { id: "knowledge" as const, label: "Knowledge", count: "14" },
            { id: "insights" as const, label: "Insights", count: null },
            { id: "models" as const, label: "Model & keys", count: null },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "h-[34px] px-3.5 text-[12.5px] font-medium transition-colors cursor-pointer border-b-2 -mb-px flex items-center gap-1.5",
                  isActive
                    ? "border-[var(--gold)] text-[var(--t1)] font-semibold"
                    : "border-transparent text-[var(--t3)] hover:text-[var(--t2)]"
                )}
              >
                <span>{tab.label}</span>
                {tab.count && (
                  <bdi className="font-mono text-[10.5px] opacity-75 tabular-nums">
                    {tab.count}
                  </bdi>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab 1: Agents View */}
        {activeTab === "agents" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4">
              {/* Left Column (Agents list + Reel funnel) */}
              <div className="space-y-4">
                <AiAgentCards onNewAgent={() => setIsNewAgentOpen(true)} />
                <ReelOrderFunnel onFullInsights={() => handleTabChange("insights")} />
              </div>

              {/* Right Column (Knowledge + Model) */}
              <div className="space-y-4">
                <KnowledgePanel
                  mode="summary"
                  onAddSource={() => handleTabChange("knowledge")}
                />
                <ModelKeyPicker
                  mode="summary"
                  onManageKeys={() => handleTabChange("models")}
                />
              </div>
            </div>

            {/* Bottom Row: Questions the agent couldn't answer */}
            <UnansweredQuestions />
          </div>
        )}

        {/* Tab 2: Knowledge View */}
        {activeTab === "knowledge" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <KnowledgePanel mode="full" />
            <UnansweredQuestions />
          </div>
        )}

        {/* Tab 3: Insights View */}
        {activeTab === "insights" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <ReelOrderFunnel />
            <AnalyticsDashboardView />
          </div>
        )}

        {/* Tab 4: Model & keys View */}
        {activeTab === "models" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <ModelKeyPicker mode="full" />
          </div>
        )}
      </div>

      {/* Interactive AI Playground Modal */}
      <AiPlaygroundDialog
        open={isPlaygroundOpen}
        onOpenChange={setIsPlaygroundOpen}
      />

      {/* New Agent Dialog */}
      <Dialog open={isNewAgentOpen} onOpenChange={setIsNewAgentOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-[var(--gold)]" />
              <span>Configure New Agent</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Create an AI persona to handle incoming conversations across your connected platforms.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs text-[var(--t3)] block mb-1">Agent Name</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g. Sales Assistant, VIP Support"
                className="w-full h-8 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--t3)] block mb-1">Agent Focus</label>
              <select
                value={newAgentRole}
                onChange={(e) => setNewAgentRole(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] focus:outline-none focus:border-[var(--gold)]"
              >
                <option value="Sales & Inquiries">Sales & Product Inquiries</option>
                <option value="Customer Support">Customer Support & FAQs</option>
                <option value="Order Tracking">Order & Delivery Tracking</option>
                <option value="Lead Qualification">Lead Qualification</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[var(--t3)] block mb-1">Tone of Voice</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "friendly", label: "Friendly" },
                  { id: "professional", label: "Professional" },
                  { id: "concise", label: "Concise" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setNewAgentTone(t.id)}
                    className={cn(
                      "h-8 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                      newAgentTone === t.id
                        ? "border-[var(--gold)] bg-[var(--goldbg)] text-[var(--gold)]"
                        : "border-[var(--line)] bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsNewAgentOpen(false)}
              className="h-8 text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreateAgent}
              className="h-8 text-xs font-medium cursor-pointer"
            >
              Create & Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AiEnginePage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-[var(--bg)]">
          <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
        </div>
      }
    >
      <AiAgentContent />
    </Suspense>
  )
}
