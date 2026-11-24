"use client"

import { useState, useEffect } from "react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, Trash2, Save, RefreshCw, Brain, Sparkles, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import type { IceBreaker } from "@/types/db"
import ConnectPlatformEmptyState from "@/components/dashboard/ConnectPlatformEmptyState"
import { EmptyState } from "@/components/ui/EmptyState"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { readCache, cachedFetch, clearCache } from "@/lib/client-cache"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"

export function IceBreakersManager() {
  const { userId, isLoading } = useInstagramSession()
  const [breakers, setBreakers] = useState<Partial<IceBreaker>[]>([])
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const { t } = useLanguage()

  // AI Config State
  const { data: aiData, mutate: mutateAi } = useSWR(
    userId ? `/api/groq/auto-reply?userId=${userId}` : null,
    fetcher
  )
  const aiEnabled = aiData?.enabled ?? false

  const [aiToggling, setAiToggling] = useState(false)
  const [aiContext, setAiContext] = useState("")
  const [aiContextSaving, setAiContextSaving] = useState(false)
  const [aiContextSaved, setAiContextSaved] = useState(false)

  useEffect(() => {
    if (aiData?.ai_context !== undefined) {
      setAiContext(aiData.ai_context)
    }
  }, [aiData])

  const handleSaveAiContext = async () => {
    if (aiContextSaving) return
    setAiContextSaving(true)
    try {
      await fetch("/api/groq/auto-reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled: aiEnabled, ai_context: aiContext }),
      })
      mutateAi()
      setAiContextSaved(true)
      setTimeout(() => setAiContextSaved(false), 2000)
    } catch {}
    setAiContextSaving(false)
  }

  const handleToggleAI = async () => {
    if (aiToggling) return
    setAiToggling(true)
    const newState = !aiEnabled
    try {
      const res = await fetch("/api/groq/auto-reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled: newState }),
      })
      if (res.ok) {
        mutateAi()
      }
    } catch {}
    setAiToggling(false)
  }

  useEffect(() => {
    if (!userId) return
    const cacheKey = `/api/ice-breakers?userId=${userId}`
    const cached = readCache<IceBreaker[]>(cacheKey)
    if (cached) {
      setBreakers(cached)
      setFetching(false)
    }
    cachedFetch(cacheKey, async () => {
      const res = await fetch(`/api/ice-breakers?userId=${userId}`)
      const data = await res.json()
      return Array.isArray(data) ? data : []
    })
      .then((data) => {
        setBreakers(data)
        setFetching(false)
      })
      .catch((err) => {
        console.error(err)
        setFetching(false)
      })
  }, [userId])

  const handleAdd = () => {
    if (breakers.length >= 4) {
      toast.error("Maximum 4 ice breakers allowed by Instagram")
      return
    }
    setBreakers([...breakers, { question: "", response: "" }])
  }

  const handleChange = (index: number, field: "question" | "response", value: string) => {
    const newBreakers = [...breakers]
    newBreakers[index] = { ...newBreakers[index], [field]: value }
    setBreakers(newBreakers)
  }

  const handleConfirmRemove = () => {
    if (deleteIndex !== null) {
      setBreakers(breakers.filter((_, i) => i !== deleteIndex))
      setDeleteIndex(null)
    }
  }

  const handleSave = async () => {
    if (!userId) return

    // Validation
    if (breakers.some((b) => !b.question?.trim() || !b.response?.trim())) {
      toast.error("Please fill in all fields")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/ice-breakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, iceBreakers: breakers }),
      })
      const data = await res.json()
      if (data.success) {
        clearCache(`/api/ice-breakers?userId=${userId}`)
        if (data.warning) {
          toast.error(
            `Saved to DB, but Instagram sync failed: ${data.error?.message || "Rate limit or API error"}`
          )
        } else {
          toast.success("Ice breakers saved and synced successfully")
        }
      } else {
        toast.error(data.error || "Failed to save")
      }
    } catch {
      toast.error("Error saving ice breakers")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || (fetching && !breakers.length && userId)) {
    return (
      <div className="space-y-4 max-w-2xl py-6 animate-pulse">
        <div className="h-6 w-40 bg-[var(--s2)] rounded-md" />
        <div className="h-28 w-full bg-[var(--s2)] rounded-xl" />
        <div className="h-24 w-full bg-[var(--s2)] rounded-xl" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="p-6 flex items-center justify-center">
        <ConnectPlatformEmptyState description="You need to connect your professional Instagram account to manage ice breakers." />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--t1)]">
            {t.iceBreakersTitle || "Instagram Ice Breakers"}
          </h2>
          <p className="text-[12px] text-[var(--t3)] mt-0.5">
            {t.iceBreakersDesc ||
              "Prompt buttons displayed to visitors opening direct messages for the first time."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Auto-Reply Toggle */}
          {aiData === undefined ? (
            <Loader2 className="w-4 h-4 text-[var(--t3)] animate-spin" />
          ) : (
            <button
              type="button"
              onClick={handleToggleAI}
              disabled={aiToggling}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-[6px] font-mono text-[11px] font-medium transition-colors cursor-pointer",
                aiEnabled
                  ? "bg-[var(--goldbg)] border border-[var(--goldline)] text-[var(--gold2)]"
                  : "border border-[var(--line)] bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
              )}
            >
              <Sparkles className={cn("w-3 h-3", aiToggling && "animate-pulse")} />
              <span>{aiToggling ? "Updating..." : aiEnabled ? "AI auto-reply on" : "AI auto-reply off"}</span>
            </button>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-3.5 text-[12px] font-medium gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save & sync</span>
          </Button>
        </div>
      </div>

      {/* AI Context Panel */}
      <div className="rounded-xl border border-[var(--goldline)] bg-[var(--goldbg)] p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-[var(--gold)]">
          <Brain className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-[12.5px] font-semibold text-[var(--t1)]">
            AI personality context
          </span>
        </div>
        <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
          Tell AI about your brand, tone, products, and what to avoid when replying to ice breakers.
        </p>
        <Textarea
          value={aiContext}
          onChange={(e) => setAiContext(e.target.value)}
          placeholder="e.g. Describe your brand, your products and prices, and how replies should sound..."
          rows={3}
          className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-lg px-3 py-2 text-[12.5px] text-[var(--t1)] placeholder:text-[var(--t4)] resize-none focus:outline-none focus:border-[var(--line2)]"
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSaveAiContext}
            disabled={aiContextSaving}
            className="h-7 px-3 text-[11px] font-medium"
          >
            {aiContextSaving ? "Saving..." : aiContextSaved ? "Saved ✓" : "Save AI context"}
          </Button>
        </div>
      </div>

      {/* Ice Breaker Rows */}
      <div className="space-y-3">
        {breakers.map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 space-y-3 relative group"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-[11px] font-mono text-[var(--t3)] uppercase tracking-wider block mb-1">
                    Question {idx + 1}
                  </label>
                  <Input
                    value={item.question || ""}
                    onChange={(e) => handleChange(idx, "question", e.target.value)}
                    placeholder="e.g. What are your prices?"
                    className="h-8 bg-[var(--s2)] border-[var(--line)] text-[12.5px]"
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-[var(--t3)] uppercase tracking-wider block mb-1">
                    Auto-response
                  </label>
                  <Textarea
                    value={item.response || ""}
                    onChange={(e) => handleChange(idx, "response", e.target.value)}
                    placeholder="The reply users will receive when clicking this question..."
                    className="bg-[var(--s2)] border-[var(--line)] text-[12.5px] resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteIndex(idx)}
                className="h-8 w-8 text-[var(--t3)] hover:text-[var(--red)] hover:bg-[var(--s2)] shrink-0"
                aria-label={`Delete question ${idx + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {breakers.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            badge="Instagram direct"
            title="No ice breakers configured"
            description="Add interactive conversation prompts that appear when new visitors open your Instagram DM window."
            action={{
              label: "Add first question",
              onClick: handleAdd,
            }}
          />
        )}

        {breakers.length > 0 && breakers.length < 4 && (
          <Button
            variant="secondary"
            onClick={handleAdd}
            className="w-full h-9 border-dashed border-[var(--line2)] text-[12px] font-medium gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add question ({breakers.length}/4)</span>
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-3.5 flex items-center gap-3 text-[11.5px] text-[var(--t3)]">
        <RefreshCw className="w-4 h-4 text-[var(--t3)] shrink-0" />
        <p>
          Changes made here are automatically synced to your Instagram professional profile.
        </p>
      </div>

      {/* Confirm Delete Dialog */}
      {deleteIndex !== null && (
        <ConfirmDialog
          open={deleteIndex !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteIndex(null)
          }}
          title="Delete ice breaker question?"
          description="This question will be removed from your Instagram profile upon the next sync."
          confirmLabel="Delete question"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={handleConfirmRemove}
        />
      )}
    </div>
  )
}
