"use client"

import React from "react"
import { Sparkles, Loader2 } from "lucide-react"

interface AiIntentBuilderProps {
  intentDescription: string
  setIntentDescription: (v: string) => void
  parsingIntent: boolean
  handleParseIntent: () => void
}

export function AiIntentBuilder({
  intentDescription,
  setIntentDescription,
  parsingIntent,
  handleParseIntent,
}: AiIntentBuilderProps) {
  return (
    <div className="bg-neutral-900/60 border border-white/5 rounded-2xl p-4 md:px-8">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#e5a93c]" /> Describe what you want
        </label>
        <p className="text-xs text-neutral-400">
          Tell our AI what you want to automate (e.g., &quot;when people comment &apos;price&apos;, send them my price list&quot;) and we&apos;ll set up the form for you.
        </p>
        <div className="flex gap-2 mt-2">
          <input
            value={intentDescription}
            onChange={(e) => setIntentDescription(e.target.value)}
            placeholder="Describe your automation..."
            className="flex-1 h-10 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#e5a93c]/50 transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleParseIntent()}
          />
          <button
            type="button"
            onClick={handleParseIntent}
            disabled={!intentDescription.trim() || parsingIntent}
            className="h-10 px-6 rounded-xl bg-[#e5a93c]/10 hover:bg-[#e5a93c]/20 text-[#e5a93c] text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center min-w-[120px]"
          >
            {parsingIntent ? <Loader2 className="w-4 h-4 animate-spin" /> : "Auto-fill"}
          </button>
        </div>
      </div>
    </div>
  )
}
