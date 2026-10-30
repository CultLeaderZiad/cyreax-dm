"use client"

import React from "react"
import { Loader2, Sparkles, MessageSquare } from "lucide-react"
import { TagInput } from "@/components/ui/tag-input"
import { cn } from "@/lib/utils"

interface KeywordMatchConfigProps {
  triggerSource: "comment" | "dm" | "story"
  storyTriggerType: "mention" | "reaction" | "reply"
  triggers: string[]
  setTriggers: (t: string[]) => void
  generatingKeywords: boolean
  handleGenerateKeywords: () => void
  keywordSuggestions: any[]
  handleAcceptKeywords: (suggestion: { id?: string; text: string }) => void
  setKeywordSuggestions: (suggestions: any[]) => void
  includeReplies: boolean
  setIncludeReplies: (b: boolean) => void
  needsKeywords: boolean
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10.5px] font-medium text-[var(--t3)] mb-1.5">
      {children}
    </p>
  )
}

function ToggleRow({
  icon,
  title,
  sub,
  on,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full p-3.5 rounded-xl border text-start flex items-center gap-3.5 transition-colors cursor-pointer",
        on
          ? "border-[var(--goldline)] bg-[var(--goldbg)]"
          : "border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s2)]"
      )}
    >
      <span className={on ? "text-[var(--gold)]" : "text-[var(--t3)]"}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[var(--t1)]">{title}</span>
        <span className="block text-[11px] text-[var(--t3)] mt-0.5 leading-relaxed">{sub}</span>
      </span>
      <span
        className={cn(
          "w-9 h-5 rounded-full relative transition-colors shrink-0",
          on ? "bg-[var(--gold)]" : "bg-[var(--line2)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-black shadow-sm transition-all",
            on ? "start-[18px]" : "start-0.5"
          )}
        />
      </span>
    </button>
  )
}

export function KeywordMatchConfig({
  triggerSource,
  storyTriggerType,
  triggers,
  setTriggers,
  generatingKeywords,
  handleGenerateKeywords,
  keywordSuggestions,
  handleAcceptKeywords,
  setKeywordSuggestions,
  includeReplies,
  setIncludeReplies,
  needsKeywords,
}: KeywordMatchConfigProps) {
  return (
    <div className="space-y-4 pt-3 border-t border-[var(--line)]">
      {triggerSource === "comment" ? (
        <div className="space-y-2">
          <FieldLabel>Keywords to match</FieldLabel>
          <p className="text-[11.5px] text-[var(--t3)]">
            What keyword triggers this DM?{" "}
            <span className="text-[var(--gold)] font-medium">Keep empty to reply to every comment.</span>
          </p>
          <TagInput
            value={triggers}
            onChange={setTriggers}
            placeholder="Type keyword, press Enter (e.g. price)"
          />
          {triggers.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleGenerateKeywords}
                disabled={generatingKeywords}
                className="flex items-center gap-1.5 text-xs text-[var(--gold2)] hover:text-white transition-colors bg-[var(--goldbg)] border border-[var(--goldline)] px-3 py-1.5 rounded-[6px] disabled:opacity-50 cursor-pointer"
              >
                {generatingKeywords ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                )}
                <span>Improve with AI</span>
              </button>

              {keywordSuggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {keywordSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 bg-[var(--s2)] p-3 rounded-lg border border-[var(--line)]"
                    >
                      <p className="text-xs text-[var(--t2)] font-mono break-words">{s.text}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptKeywords(s)}
                          className="text-[11px] font-semibold text-black bg-[var(--gold)] px-3 py-1 rounded-[5px] hover:brightness-105 cursor-pointer"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeywordSuggestions([])}
                          className="text-[11px] font-medium text-[var(--t3)] bg-[var(--s3)] px-3 py-1 rounded-[5px] hover:text-[var(--t1)] cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : needsKeywords ? (
        <div className="space-y-2 bg-[var(--s1)] p-4 rounded-xl border border-[var(--line)]">
          <FieldLabel>
            {triggerSource === "story" && storyTriggerType === "reaction"
              ? "Only react on these emojis"
              : "Trigger keywords"}
          </FieldLabel>
          <p className="text-[11.5px] text-[var(--t3)] mb-2">
            {triggerSource === "story" && storyTriggerType === "reaction"
              ? "Leave empty to trigger on any emoji reaction."
              : "Matches exact phrases or words (case-insensitive)."}
          </p>
          <TagInput
            value={triggers}
            onChange={setTriggers}
            placeholder={
              triggerSource === "story" && storyTriggerType === "reaction"
                ? "e.g. ❤️, 🔥, 👍"
                : "Type keyword, press Enter (e.g. price)"
            }
          />
          {triggers.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleGenerateKeywords}
                disabled={generatingKeywords}
                className="flex items-center gap-1.5 text-xs text-[var(--gold2)] hover:text-white transition-colors bg-[var(--goldbg)] border border-[var(--goldline)] px-3 py-1.5 rounded-[6px] disabled:opacity-50 cursor-pointer"
              >
                {generatingKeywords ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                )}
                <span>Improve with AI</span>
              </button>

              {keywordSuggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {keywordSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 bg-[var(--s2)] p-3 rounded-lg border border-[var(--line)]"
                    >
                      <p className="text-xs text-[var(--t2)] font-mono break-words">{s.text}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptKeywords(s)}
                          className="text-[11px] font-semibold text-black bg-[var(--gold)] px-3 py-1 rounded-[5px] hover:brightness-105 cursor-pointer"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeywordSuggestions([])}
                          className="text-[11px] font-medium text-[var(--t3)] bg-[var(--s3)] px-3 py-1 rounded-[5px] hover:text-[var(--t1)] cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {triggerSource === "comment" && triggers.length > 0 && (
        <ToggleRow
          icon={<MessageSquare className="w-4 h-4" />}
          title="Check replies to comments"
          sub="Normally only primary post comments trigger replies"
          on={includeReplies}
          onToggle={() => setIncludeReplies(!includeReplies)}
        />
      )}
    </div>
  )
}
