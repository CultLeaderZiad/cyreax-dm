"use client"

import React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const STEPS = [
  { key: "trigger", label: "Trigger source", sub: "When does it fire?" },
  { key: "response", label: "Reply payload", sub: "What do they get?" },
  { key: "settings", label: "Final settings", sub: "Speed & restrictions" },
] as const

interface TimelineStepperProps {
  step: number
  setStep: (s: number) => void
  stepValid: boolean[]
}

export function TimelineStepper({
  step,
  setStep,
  stepValid,
}: TimelineStepperProps) {
  return (
    <div className="relative bg-[var(--s1)] border border-[var(--line)] rounded-xl p-4 md:px-6">
      <div className="flex items-center justify-between gap-4 relative">
        {STEPS.map((s, i) => {
          const isActive = i === step
          const isCompleted = i < step
          return (
            <div key={s.key} className="flex items-center gap-3 flex-1 last:flex-initial">
              <button
                type="button"
                onClick={() => {
                  if (i < step || stepValid[step]) setStep(i)
                }}
                className="flex items-center gap-3 group text-start focus:outline-none cursor-pointer"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold font-mono transition-colors",
                    isCompleted
                      ? "bg-[var(--gold)] text-black"
                      : isActive
                      ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--goldline)] text-[var(--gold)]"
                      : "bg-[var(--s2)] text-[var(--t3)] border border-[var(--line)]"
                  )}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : i + 1}
                </div>
                <div className="hidden md:block">
                  <p
                    className={cn(
                      "text-xs font-medium tracking-tight",
                      isActive ? "text-[var(--t1)]" : "text-[var(--t3)] group-hover:text-[var(--t2)]"
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="text-[10.5px] text-[var(--t4)] font-mono">{s.sub}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-[1px] mx-2 relative bg-[var(--line)] overflow-hidden">
                  <div
                    className={cn(
                      "absolute inset-y-0 start-0 transition-all duration-300 bg-[var(--gold)]",
                      isCompleted ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
