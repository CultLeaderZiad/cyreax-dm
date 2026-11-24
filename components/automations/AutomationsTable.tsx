"use client"

import React, { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Pill } from "@/components/ui/Pill"
import { Tag } from "@/components/ui/Tag"
import { ChannelBadge } from "@/components/ui/ChannelBadge"
import {
  MessageCircle,
  Send,
  Sparkles,
  Star,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import type { Automation } from "@/lib/types"

interface AutomationsTableProps {
  automations: Automation[]
  selectedId: string | null
  onSelect: (automation: Automation) => void
  onToggle: (rule: Automation, active: boolean) => void
  onEdit?: (rule: Automation) => void
  onDelete?: (id: string) => void
  onDuplicate?: (rule: Automation) => void
}

export function AutomationsTable({
  automations,
  selectedId,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: AutomationsTableProps) {
  const [ruleToDelete, setRuleToDelete] = useState<Automation | null>(null)

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-[12px] border-collapse select-none">
          <thead className="sticky top-0 z-10 bg-[var(--s1)]">
            <tr className="border-b border-[var(--line)] bg-[var(--s2)]/70 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
              <th className="py-2.5 px-4 font-medium">Automation</th>
              <th className="py-2.5 px-3 font-medium">Channel</th>
              <th className="py-2.5 px-3 font-medium text-end">Runs 7d</th>
              <th className="py-2.5 px-4 font-medium text-center">Status</th>
              <th className="py-2.5 px-3 font-medium text-end sr-only">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {automations.map((rule) => {
              const isSelected = selectedId === rule.id
              const channel = (rule.platform || "instagram").toLowerCase()

              // Parse keywords
              const rawKeywords = rule.trigger_value || (rule as any).keywords || ""
              const keywords: string[] = rawKeywords
                ? rawKeywords.split(",").map((k: string) => k.trim()).filter(Boolean)
                : []

              // Real count of times this rule fired in the last 7 days (from automation_events).
              const runsCount = (rule as any).runs_7d != null ? Number((rule as any).runs_7d).toLocaleString() : "—"
              const isDraft = !rule.is_active && Boolean((rule as any).is_draft)

              return (
                <tr
                  key={rule.id}
                  role="row"
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => onSelect(rule)}
                  onDoubleClick={() => onEdit?.(rule)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onEdit?.(rule)
                    }
                  }}
                  className={cn(
                    "hover:bg-[var(--s2)]/70 transition-colors cursor-pointer relative group focus:outline-none focus-visible:bg-[var(--s2)]",
                    isSelected
                      ? "bg-[var(--s2)] before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-[var(--gold)]"
                      : ""
                  )}
                >
                  {/* Automation column */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1 min-w-[200px]">
                      <span className="font-semibold text-[13px] text-[var(--t1)] group-hover:text-white transition-colors">
                        {rule.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--t3)] flex-wrap">
                        {(
                          <>
                            {rule.platform === "telegram" || rule.platform === "whatsapp" || rule.platform === "webchat" ? (
                              <Send className="w-3 h-3 text-[var(--t3)] shrink-0" />
                            ) : rule.trigger_source === "comment" ? (
                              <MessageCircle className="w-3 h-3 text-[var(--t3)] shrink-0" />
                            ) : rule.trigger_source === "dm" ? (
                              <Send className="w-3 h-3 text-[var(--t3)] shrink-0" />
                            ) : rule.trigger_source === "ice_breaker" ? (
                              <Sparkles className="w-3 h-3 text-[var(--t3)] shrink-0" />
                            ) : (
                              <Star className="w-3 h-3 text-[var(--t3)] shrink-0" />
                            )}
                            <span>
                              {rule.platform === "telegram" || rule.platform === "whatsapp" || rule.platform === "webchat"
                                ? keywords.length > 0
                                  ? "Message contains"
                                  : "Any incoming message"
                                : rule.trigger_source === "comment"
                                ? keywords.length > 0
                                  ? "Comment contains"
                                  : "Any comment on selected posts"
                                : rule.trigger_source === "dm"
                                ? "Keyword"
                                : rule.trigger_source === "ice_breaker"
                                ? "Ice breaker prompt"
                                : "Story mention"}
                            </span>
                            {keywords.map((kw, i) => (
                              <Tag key={i} className="text-[10.5px]" dir="auto">
                                {kw}
                              </Tag>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Channel column */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <ChannelBadge channel={channel} size="sm" className="w-4 h-4 rounded-full" />
                    </div>
                  </td>

                  {/* Runs 7d column */}
                  <td className="py-3 px-3 text-end font-mono text-[11.5px] text-[var(--t2)] tabular-nums">
                    {runsCount}
                  </td>

                  {/* Status column */}
                  <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                    {isDraft ? (
                      <Pill variant="amber" dot={false} className="mx-auto">
                        Draft
                      </Pill>
                    ) : (
                      <div className="flex justify-center">
                        <Switch
                          role="switch"
                          aria-label={rule.is_active ? `Pause ${rule.name}` : `Activate ${rule.name}`}
                          checked={rule.is_active}
                          onCheckedChange={(checked) => onToggle(rule, checked)}
                        />
                      </div>
                    )}
                  </td>

                  {/* Actions (visible on hover) */}
                  <td className="py-3 px-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(rule)}
                          className="p-1 rounded-[4px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)] cursor-pointer"
                          title="Edit rule"
                          aria-label={`Edit ${rule.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDuplicate && (
                        <button
                          type="button"
                          onClick={() => onDuplicate(rule)}
                          className="p-1 rounded-[4px] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s3)] cursor-pointer"
                          title="Duplicate rule"
                          aria-label={`Duplicate ${rule.name}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => setRuleToDelete(rule)}
                          className="p-1 rounded-[4px] text-[var(--t3)] hover:text-[var(--red)] hover:bg-[var(--s3)] cursor-pointer"
                          title="Delete rule"
                          aria-label={`Delete ${rule.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      {ruleToDelete && (
        <ConfirmDialog
          open={Boolean(ruleToDelete)}
          onOpenChange={(open) => {
            if (!open) setRuleToDelete(null)
          }}
          title={`Delete "${ruleToDelete.name}"?`}
          description="This will permanently delete this automation rule and pause all triggers associated with it."
          confirmLabel="Delete automation"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => {
            if (ruleToDelete && onDelete) {
              onDelete(ruleToDelete.id)
              setRuleToDelete(null)
            }
          }}
        />
      )}
    </div>
  )
}
