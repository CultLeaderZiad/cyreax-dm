"use client"

import React, { useState, useRef } from "react"
import { Globe, Package, FileText, Upload, Plus, Search, Trash2, Edit3, Check } from "lucide-react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface QaItem {
  id: string
  question: string
  answer: string
  category: string
}

interface SourceItem {
  id: string
  icon: React.ComponentType<{ className?: string }>
  name: string
  statusText?: string | null
  pill?: React.ReactNode
}

export function KnowledgePanel({
  mode = "summary",
  onAddSource,
}: {
  mode?: "summary" | "full"
  onAddSource?: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sources, setSources] = useState<SourceItem[]>([])
  const [qaItems, setQaItems] = useState<QaItem[]>([])
  const [qaSearch, setQaSearch] = useState("")
  const [editingQa, setEditingQa] = useState<QaItem | null>(null)
  const [deletingQaId, setDeletingQaId] = useState<string | null>(null)
  const [isAddQaOpen, setIsAddQaOpen] = useState(false)
  const [newQuestion, setNewQuestion] = useState("")
  const [newAnswer, setNewAnswer] = useState("")
  const [newCategory, setNewCategory] = useState("General")
  const [isLoading, setIsLoading] = useState(true)

  const loadKnowledge = React.useCallback(() => {
    setIsLoading(true)
    fetch("/api/ai-agent/knowledge")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.sources)) {
          const apiSources = data.sources.map((s: any) => ({
            id: s.id,
            icon: s.kind === "website" ? Globe : s.kind === "product" ? Package : FileText,
            name: s.title,
            statusText: s.created_at ? new Date(s.created_at).toLocaleDateString() : "synced",
            pill: <Pill variant="green" dot={false}>Synced</Pill>,
          }))
          setSources(apiSources)

          const faqs = data.sources
            .filter((s: any) => s.kind === "faq" || s.kind === "policy" || !s.kind)
            .map((s: any) => ({
              id: String(s.id),
              question: s.title,
              answer: s.body || "",
              category: s.kind === "policy" ? "Policy" : "FAQ",
            }))
          setQaItems(faqs)
        } else {
          setSources([])
          setQaItems([])
        }
      })
      .catch((err) => {
        console.error("[KnowledgePanel] load error:", err)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  React.useEffect(() => {
    loadKnowledge()
  }, [loadKnowledge])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const file = files[0]
      const formData = new FormData()
      formData.append("file", file)
      try {
        await fetch("/api/ai-agent/knowledge", {
          method: "POST",
          body: formData,
        })
        toast.success(`Uploaded ${file.name} to knowledge base`)
        loadKnowledge()
      } catch (err) {
        toast.error("Upload error")
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      const formData = new FormData()
      formData.append("file", file)
      try {
        await fetch("/api/ai-agent/knowledge", {
          method: "POST",
          body: formData,
        })
        toast.success(`Uploaded ${file.name} to knowledge base`)
        loadKnowledge()
      } catch (err) {
        toast.error("Upload error")
      }
    }
  }

  const handleSaveEditQa = async () => {
    if (!editingQa) return
    try {
      await fetch("/api/ai-agent/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingQa.id,
          title: editingQa.question,
          body: editingQa.answer,
        }),
      })
      toast.success("Q&A updated in knowledge base")
      loadKnowledge()
    } catch {
      toast.error("Failed to update Q&A")
    }
    setEditingQa(null)
  }

  const handleDeleteQa = async () => {
    if (!deletingQaId) return
    try {
      await fetch(`/api/ai-agent/knowledge?id=${encodeURIComponent(deletingQaId)}`, {
        method: "DELETE",
      })
      toast.success("Q&A entry removed from knowledge base")
      loadKnowledge()
    } catch {
      toast.error("Failed to delete Q&A")
    }
    setDeletingQaId(null)
  }

  const handleAddQa = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return
    const q = newQuestion.trim()
    const a = newAnswer.trim()
    try {
      const res = await fetch("/api/ai-agent/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "faq",
          title: q,
          body: a,
        }),
      })
      if (res.ok) {
        toast.success("Added new Q&A entry to workspace knowledge")
        loadKnowledge()
      } else {
        toast.error("Could not save Q&A")
      }
    } catch {
      toast.error("Network error saving knowledge")
    }

    setNewQuestion("")
    setNewAnswer("")
    setIsAddQaOpen(false)
  }

  const filteredQa = qaItems.filter(
    (item) =>
      item.question.toLowerCase().includes(qaSearch.toLowerCase()) ||
      item.answer.toLowerCase().includes(qaSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(qaSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Knowledge Sources Card */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 select-none space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-[var(--t1)] tracking-tight">
              Knowledge
            </h3>
            <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-[4px] bg-[var(--s2)] text-[var(--t2)] border border-[var(--line)] leading-none">
              {sources.length} sources
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (onAddSource) onAddSource()
              else fileInputRef.current?.click()
            }}
            className="h-[26px] px-2 text-[11px] font-medium gap-1"
          >
            <Plus className="w-3 h-3 text-[var(--t3)]" />
            <span>+ Add</span>
          </Button>
        </div>

        {/* Source items */}
        <div className="space-y-2">
          {sources.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--t3)] rounded-lg border border-dashed border-[var(--line)] bg-[var(--s2)]/40 p-3">
              <p className="text-[11.5px] text-[var(--t2)] font-medium">No knowledge documents yet</p>
              <p className="text-[10.5px] text-[var(--t3)]">Upload PDFs, catalogs, or policy files below</p>
            </div>
          ) : (
            sources.map((src) => {
              const Icon = src.icon
              return (
                <div
                  key={src.id}
                  className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-2.5 flex items-center justify-between gap-3 hover:bg-[var(--s3)] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 text-[var(--t3)] shrink-0" />
                    <span className="text-[12px] text-[var(--t1)] font-medium truncate">
                      {src.name}
                    </span>
                  </div>

                  <div className="shrink-0 text-end">
                    {src.pill ? (
                      src.pill
                    ) : (
                      <span className="font-mono text-[11px] text-[var(--t3)]">
                        {src.statusText}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Upload dropzone (drag-over turns border --goldline) */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.csv,.json,.txt"
        />
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "rounded-lg border border-dashed p-4 text-center space-y-1 transition-colors cursor-pointer",
            isDragging
              ? "border-[var(--goldline)] bg-[var(--goldbg)]"
              : "border-[var(--line2)] hover:border-[var(--line3)] bg-[var(--s2)]/40 hover:bg-[var(--s2)]"
          )}
        >
          <Upload className="w-4 h-4 text-[var(--t3)] mx-auto mb-1.5" />
          <p className="text-[12px] font-medium text-[var(--t1)]">
            Drop PDFs, price lists or chat exports
          </p>
          <p className="text-[10.5px] text-[var(--t3)] font-mono">
            Arabic and English · up to 20 MB
          </p>
        </div>
      </div>

      {/* Full Mode: Q&A Knowledge Management */}
      {mode === "full" && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 select-none space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--t1)]">
                Q&A Knowledge Base
              </h3>
              <p className="text-xs text-[var(--t3)]">
                The agent answers DMs using exact answers defined below.
              </p>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => setIsAddQaOpen(true)}
              className="h-[28px] text-xs font-medium gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Q&A</span>
            </Button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--t3)] absolute start-3 top-2.5" />
            <input
              value={qaSearch}
              onChange={(e) => setQaSearch(e.target.value)}
              placeholder="Search knowledge questions, answers, or tags..."
              className="w-full h-8 ps-8 pe-3 bg-[var(--s2)] border border-[var(--line)] rounded-lg text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none"
            />
          </div>

          {/* Q&A List */}
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {filteredQa.length === 0 ? (
              qaSearch ? (
                <div className="py-8 text-center text-xs text-[var(--t3)]">
                  No matching Q&A entries found for &quot;{qaSearch}&quot;.
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--t3)] rounded-lg border border-dashed border-[var(--line)] bg-[var(--s2)]/30 p-6 my-2">
                  <div className="w-8 h-8 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] flex items-center justify-center mx-auto mb-2 font-mono text-xs">?</div>
                  <p className="font-semibold text-[var(--t1)] mb-1 text-[13px]">No Q&A entries yet</p>
                  <p className="text-[11.5px] text-[var(--t3)] max-w-sm mx-auto mb-3.5 leading-relaxed">
                    Add customer questions and your approved answers. The AI agent will respond to customer inquiries across all channels using this exact knowledge.
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setIsAddQaOpen(true)}
                    className="h-[28px] text-xs font-medium gap-1 mx-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add your first Q&A</span>
                  </Button>
                </div>
              )
            ) : (
              filteredQa.map((qa) => (
                <div
                  key={qa.id}
                  className="py-3.5 flex items-start justify-between gap-4 hover:bg-[var(--s2)]/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--s3)] text-[var(--t3)] border border-[var(--line)]">
                        {qa.category}
                      </span>
                      <h4
                        dir="auto"
                        className="text-[13px] font-semibold text-[var(--t1)] truncate"
                      >
                        {qa.question}
                      </h4>
                    </div>
                    <p
                      dir="auto"
                      className="text-xs text-[var(--t2)] leading-relaxed line-clamp-2"
                    >
                      {qa.answer}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setEditingQa(qa)}
                      className="p-1 text-[var(--t3)] hover:text-[var(--t1)] rounded hover:bg-[var(--s3)] transition-colors cursor-pointer"
                      title="Edit Q&A"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingQaId(qa.id)}
                      className="p-1 text-[var(--t3)] hover:text-red-400 rounded hover:bg-[var(--s3)] transition-colors cursor-pointer"
                      title="Delete Q&A"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Inline Edit Q&A Dialog */}
      <Dialog open={Boolean(editingQa)} onOpenChange={(open) => !open && setEditingQa(null)}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Edit Q&A Entry
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Modify the question, category, or automated response.
            </DialogDescription>
          </DialogHeader>

          {editingQa && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  Category
                </label>
                <input
                  value={editingQa.category}
                  onChange={(e) =>
                    setEditingQa({ ...editingQa, category: e.target.value })
                  }
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  Question
                </label>
                <input
                  dir="auto"
                  value={editingQa.question}
                  onChange={(e) =>
                    setEditingQa({ ...editingQa, question: e.target.value })
                  }
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  Answer
                </label>
                <textarea
                  dir="auto"
                  rows={3}
                  value={editingQa.answer}
                  onChange={(e) =>
                    setEditingQa({ ...editingQa, answer: e.target.value })
                  }
                  className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-[6px] p-2.5 text-xs text-[var(--t1)] focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditingQa(null)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveEditQa}
              className="h-[28px] text-xs"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Q&A Dialog */}
      <Dialog open={isAddQaOpen} onOpenChange={setIsAddQaOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Add new Q&A Entry
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Teach the agent how to answer this customer query.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Category
              </label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Shipping, Pricing, Policies..."
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Customer Question
              </label>
              <input
                dir="auto"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="السؤال باللغة العربية أو الإنجليزية..."
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Agent Response
              </label>
              <textarea
                dir="auto"
                rows={3}
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                placeholder="الإجابة المعتمدة التي يرسلها البوت تلقائياً..."
                className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-[6px] p-2.5 text-xs text-[var(--t1)] focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAddQaOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAddQa}
              disabled={!newQuestion.trim() || !newAnswer.trim()}
              className="h-[28px] text-xs"
            >
              Add entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deletingQaId)}
        onOpenChange={(open) => !open && setDeletingQaId(null)}
        title="Delete Q&A Entry"
        description="Are you sure you want to delete this question and answer? The agent will no longer be able to use this knowledge."
        confirmLabel="Delete entry"
        variant="destructive"
        onConfirm={handleDeleteQa}
      />
    </div>
  )
}
