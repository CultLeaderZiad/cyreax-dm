"use client"

import React, { useState } from "react"
import { Pill } from "@/components/ui/Pill"
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

interface UnknownQuestionItem {
  id: string
  arabicText: string
  topic: string
  count: number
}

const defaultQuestions: UnknownQuestionItem[] = [
  {
    id: "q-1",
    arabicText: "بكام الشحن لجدة؟",
    topic: "Shipping to Jeddah",
    count: 7,
  },
  {
    id: "q-2",
    arabicText: "هل المنتج حلال ومسجل في وزارة الصحة؟",
    topic: "Halal / MoH registration",
    count: 4,
  },
]

export function UnansweredQuestions() {
  const [questions, setQuestions] = useState<UnknownQuestionItem[]>(defaultQuestions)
  const [selectedQuestion, setSelectedQuestion] = useState<UnknownQuestionItem | null>(null)
  const [answerInput, setAnswerInput] = useState("")

  const handleSaveAnswer = () => {
    if (!answerInput.trim() || !selectedQuestion) return
    toast.success(`Answer saved! Agent learned response for: "${selectedQuestion.topic}"`)
    setQuestions((prev) => prev.filter((q) => q.id !== selectedQuestion.id))
    setSelectedQuestion(null)
    setAnswerInput("")
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 select-none space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13.5px] font-semibold text-[var(--t1)] tracking-tight">
            Questions the agent couldn&apos;t answer
          </h3>
          <Pill variant="amber" dot={false}>
            {questions.length > 0 ? "7 this week" : "0 this week"}
          </Pill>
        </div>

        <p className="text-[11px] text-[var(--t3)] font-mono">
          Answer once, the agent learns it for this workspace
        </p>
      </div>

      {/* Questions list */}
      <div className="divide-y divide-[var(--line)]">
        {questions.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--t3)]">
            All unknown customer questions have been answered.
          </div>
        ) : (
          questions.map((q) => (
            <div
              key={q.id}
              className="py-3 flex items-center justify-between gap-4 hover:bg-[var(--s2)]/50 px-2 -mx-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span
                  dir="rtl"
                  className="text-[13px] font-medium text-[var(--t1)] truncate"
                >
                  {q.arabicText}
                </span>
                <span className="text-[11.5px] text-[var(--t3)] truncate hidden sm:inline">
                  {q.topic}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <bdi className="font-mono text-[11px] text-[var(--t3)] tabular-nums">
                  {q.count}×
                </bdi>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedQuestion(q)
                    setAnswerInput("")
                  }}
                  className="h-[26px] px-2.5 text-[11px] font-medium"
                >
                  Add answer
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Answer Modal Dialog */}
      <Dialog
        open={Boolean(selectedQuestion)}
        onOpenChange={(open) => !open && setSelectedQuestion(null)}
      >
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Teach agent answer
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]" dir="auto">
              Question: &quot;{selectedQuestion?.arabicText}&quot; ({selectedQuestion?.topic})
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <textarea
              rows={3}
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              placeholder="اكتب الإجابة بالعامية المصرية أو الخليجية..."
              dir="auto"
              className="w-full bg-[var(--s2)] border border-[var(--line)] rounded-[6px] p-2.5 text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none resize-none leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedQuestion(null)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveAnswer}
              disabled={!answerInput.trim()}
              className="h-[28px] text-xs"
            >
              Save answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
