"use client"

import React, { useState, useRef, useEffect } from "react"
import { Play, Send, Bot, User, Sparkles, RefreshCw, X, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { cn } from "@/lib/utils"

interface ChatTurn {
  role: "user" | "assistant"
  content: string
  dialect?: string
  confidence?: number
  sources?: Array<{ id: string; excerpt: string; similarity: number }>
}

const SAMPLE_QUESTIONS = [
  "بكام الشحن لجدة والرياض؟",
  "طرق الدفع المتاحة؟",
  "هل المنتجات مرخصة من الغذاء والدواء؟",
  "سياسة الاسترجاع والاستبدال؟",
]

export function AiPlaygroundDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: "assistant",
      content: "أهلاً بك! أنا المساعد الذكي الخاص بك. اسألني أي سؤال عن المنتجات، الشحن، أو سياسات المتجر لتجربة إجاباتي.",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (open) scrollToBottom()
  }, [messages, open])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim()
    if (!text || isLoading) return

    setInput("")
    const newHistory = [...messages, { role: "user" as const, content: text }]
    setMessages(newHistory)
    setIsLoading(true)

    try {
      const res = await fetch("/api/ai-agent/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: newHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply || "لا توجد إجابة محددة في قاعدة المعرفة.",
            dialect: data.dialect,
            confidence: data.confidence,
            sources: data.sources,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "تعذر الحصول على رد من المساعد.",
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setMessages([
      {
        role: "assistant",
        content: "تمت إعادة تعيين المحادثة. اسألني أي سؤال لتجربة المساعد الذكي.",
      },
    ])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-[var(--s1)] border-[var(--line)] text-[var(--t1)] p-0 gap-0 overflow-hidden flex flex-col h-[600px] max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--s2)]/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--goldbg)] border border-[var(--goldline)] flex items-center justify-center text-[var(--gold)]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-[var(--t1)] flex items-center gap-2">
                <span>AI Agent Playground</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--goldbg)] text-[var(--gold)] border border-[var(--goldline)] font-medium">
                  Live Test
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--t3)]">
                Tests response retrieval against your active workspace Q&A knowledge base.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 px-2 text-xs text-[var(--t3)] hover:text-[var(--t1)]"
              title="Reset conversation"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-b border-[var(--line)] bg-[var(--s1)] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] text-[var(--t4)] shrink-0 font-medium">Quick test:</span>
          {SAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(q)}
              disabled={isLoading}
              className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--s2)] hover:bg-[var(--s3)] border border-[var(--line)] text-[var(--t2)] hover:text-[var(--t1)] transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin scrollbar-thumb-[var(--line2)]">
          {messages.map((m, idx) => {
            const isUser = m.role === "user"
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-2.5",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
                    isUser
                      ? "bg-[var(--gold)] text-black"
                      : "bg-[var(--s2)] border border-[var(--line)] text-[var(--gold)]"
                  )}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed space-y-1.5",
                    isUser
                      ? "bg-[var(--gold)] text-black rounded-tr-none font-medium"
                      : "bg-[var(--s2)] border border-[var(--line)] text-[var(--t1)] rounded-tl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {!isUser && (m.dialect || m.confidence !== undefined || (m.sources && m.sources.length > 0)) && (
                    <div className="pt-1.5 mt-1 border-t border-[var(--line)] flex items-center flex-wrap gap-1.5 text-[10px] text-[var(--t3)]">
                      {m.dialect && (
                        <span className="font-mono capitalize px-1.5 py-0.5 rounded bg-[var(--s1)] border border-[var(--line)]">
                          {m.dialect}
                        </span>
                      )}
                      {m.confidence !== undefined && (
                        <span className="font-mono px-1.5 py-0.5 rounded bg-[var(--s1)] border border-[var(--line)]">
                          {(m.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                      {m.sources && m.sources.length > 0 && (
                        <span className="font-mono text-[var(--gold)] px-1.5 py-0.5 rounded bg-[var(--goldbg)] border border-[var(--goldline)]">
                          {m.sources.length} sources matched
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {isLoading && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--gold)] shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-[var(--s2)] border border-[var(--line)] text-[var(--t3)] rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse delay-100" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse delay-200" />
                <span className="text-[11px] ms-1">Searching knowledge & thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-[var(--line)] bg-[var(--s1)] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question (e.g. بكام الشحن، طرق الدفع)..."
              disabled={isLoading}
              className="flex-1 h-9 px-3.5 rounded-lg bg-[var(--s2)] border border-[var(--line)] text-xs text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:border-[var(--gold)] transition-colors"
            />
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={!input.trim() || isLoading}
              className="h-9 px-3.5 gap-1.5 text-xs font-medium"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
