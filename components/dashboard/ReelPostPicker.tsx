"use client"

import React from "react"
import { Loader2, Globe, Film, Check, Link2, Facebook, Send } from "lucide-react"

interface ReelPostPickerProps {
  loadingReels: boolean
  reels: any[]
  selectedReel: any
  setSelectedReel: (r: any) => void
  hasSelectedReelOption: boolean
  setHasSelectedReelOption: (b: boolean) => void
  specificMediaUrl: string
  setSpecificMediaUrl: (s: string) => void
  resolvingUrl: boolean
  handleResolveMediaUrl: () => void
  platform?: string
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono-ui text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500 mb-2">
      {children}
    </p>
  )
}

const PLATFORM_LABELS: Record<string, { label: string; icon: React.ReactNode; placeholder: string }> = {
  instagram: { label: "Instagram", icon: null, placeholder: "Or paste post URL if missing..." },
  facebook: { label: "Facebook", icon: <Facebook className="w-4 h-4" />, placeholder: "Paste Facebook post or page URL..." },
  telegram: { label: "Telegram", icon: <Send className="w-4 h-4" />, placeholder: "Paste Telegram post link or channel URL..." },
  messenger: { label: "Messenger", icon: null, placeholder: "Paste message template URL..." },
  whatsapp: { label: "WhatsApp", icon: null, placeholder: "Paste WhatsApp message link..." },
}

export function ReelPostPicker({
  loadingReels,
  reels,
  selectedReel,
  setSelectedReel,
  hasSelectedReelOption,
  setHasSelectedReelOption,
  specificMediaUrl,
  setSpecificMediaUrl,
  resolvingUrl,
  handleResolveMediaUrl,
  platform = "instagram",
}: ReelPostPickerProps) {
  const isInstagram = platform === "instagram"
  const platformInfo = PLATFORM_LABELS[platform] || PLATFORM_LABELS.instagram

  return (
    <div className="space-y-4">
      <FieldLabel>
        {isInstagram ? "Automate which post or reel?" : `Automate which ${platformInfo.label} content?`}
      </FieldLabel>

      {/* Global Post Rule — always shown */}
      <button
        type="button"
        onClick={() => {
          setSelectedReel(null)
          setHasSelectedReelOption(true)
        }}
        className={`w-full p-4 rounded-xl border flex items-center gap-3 transition-all duration-200 ${
          hasSelectedReelOption && selectedReel === null
            ? "border-[#e5a93c] bg-[#e5a93c]/[0.06] text-[#e5a93c]"
            : "border-white/10 text-neutral-400 hover:border-white/20 hover:text-white bg-white/[0.01]"
        }`}
      >
        <Globe className="w-5 h-5 opacity-80" />
        <div className="text-start">
          <span className="text-xs font-bold block">All {platformInfo.label} Posts</span>
          <span className="text-[9px] text-neutral-500">Global Trigger — matches any content</span>
        </div>
      </button>

      {/* Post Grid for Instagram and Facebook */}
      {(isInstagram || platform === "facebook") && (
        <>
          {loadingReels ? (
            <div className="p-8 flex flex-col items-center justify-center gap-3 border border-white/5 rounded-2xl bg-white/[0.01]">
              <Loader2 className="w-6 h-6 animate-spin text-[#e5a93c]" />
              <span className="text-xs text-neutral-500 font-mono-ui">Fetching {platformInfo.label} posts...</span>
            </div>
          ) : reels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pe-1">
              {reels.map((reel) => {
                const isSelected = hasSelectedReelOption && selectedReel?.id === reel.id
                return (
                  <button
                    key={reel.id}
                    type="button"
                    onClick={() => {
                      setSelectedReel(reel)
                      setHasSelectedReelOption(true)
                    }}
                    className={`aspect-square rounded-xl border overflow-hidden relative group text-start transition-all duration-200 ${
                      isSelected
                        ? "border-[#e5a93c] ring-2 ring-[#e5a93c]/20"
                        : "border-white/10 hover:border-white/25 bg-[#0e0e0e]"
                    }`}
                  >
                    {reel.image_url || reel.thumbnail_url ? (
                      <img
                        src={reel.image_url || reel.thumbnail_url}
                        alt={
                          reel.caption
                            ? reel.caption.slice(0, 100)
                            : `${platformInfo.label} Reel from ${
                                reel.timestamp
                                  ? new Date(reel.timestamp).toLocaleDateString()
                                  : "recent"
                              }`
                        }
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                        <Film className="w-6 h-6 text-neutral-600" />
                      </div>
                    )}

                    {/* Type Overlay */}
                    <span className="absolute top-2 start-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[8px] font-mono-ui text-white uppercase tracking-wider">
                      {reel.media_type === "STORY" ? "Story" : reel.media_type === "VIDEO" ? "Reel" : "Post"}
                    </span>

                    {/* Selected Check overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-[#e5a93c]/10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="w-8 h-8 rounded-full bg-[#e5a93c] text-black flex items-center justify-center shadow-lg">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      </div>
                    )}

                    {/* Caption snippet at bottom */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2 pt-6">
                      <p className="text-[10px] text-white line-clamp-1 font-sans">
                        {reel.caption || "Untitled"}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : !loadingReels && (
            <div className="p-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-center">
              <p className="text-xs text-neutral-400">No recent {platformInfo.label} posts found.</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">You can target all posts above or paste a specific post URL below.</p>
            </div>
          )}
        </>
      )}

      {/* Non-Instagram/Non-Facebook platforms (e.g. Telegram/Messenger direct links) */}
      {!isInstagram && platform !== "facebook" && (
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] space-y-3">
          <div className="flex items-center gap-2 text-neutral-400">
            <Link2 className="w-4 h-4" />
            <span className="text-xs font-semibold">Paste a {platformInfo.label} content link (optional)</span>
          </div>
          <p className="text-[10px] text-neutral-500">
            Paste the URL of the specific {platformInfo.label} link or select &quot;All {platformInfo.label} Posts&quot; above.
          </p>
        </div>
      )}

      {/* Specific URL Input — always shown */}
      <div className="flex gap-2 items-center">
        <input
          value={specificMediaUrl}
          onChange={(e) => setSpecificMediaUrl(e.target.value)}
          placeholder={platformInfo.placeholder}
          className="flex-1 h-9 bg-white/[0.02] border border-white/10 rounded-xl px-3 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#e5a93c]/50 transition-all font-mono-ui"
        />
        <button
          type="button"
          onClick={handleResolveMediaUrl}
          disabled={!specificMediaUrl.trim() || resolvingUrl}
          className="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {resolvingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link"}
        </button>
      </div>

      {/* Confirmed Resolved Post Card — Shows customer what was actually found */}
      {selectedReel && hasSelectedReelOption && selectedReel.id && (
        <div className="relative rounded-xl border border-[#e5a93c]/30 bg-gradient-to-br from-[#e5a93c]/[0.08] to-transparent p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#e5a93c]/10 border border-[#e5a93c]/20 flex items-center justify-center text-[#e5a93c] shrink-0">
                {platformInfo.icon || <Film className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-white">
                    {selectedReel.author_name || selectedReel.author || `${platformInfo.label} Post`}
                  </p>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#10b981]/15 text-[#10b981] text-[9px] font-mono-ui font-semibold border border-[#10b981]/30">
                    <Check className="w-2.5 h-2.5 stroke-[3]" /> Target Confirmed
                  </span>
                </div>
                <p className="text-[10px] font-mono-ui text-neutral-400 mt-0.5">
                  ID: <span className="text-white">{selectedReel.id}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedReel(null)
                setHasSelectedReelOption(false)
                setSpecificMediaUrl("")
              }}
              className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
            >
              Clear
            </button>
          </div>

          <div className="flex gap-3 items-start pt-1">
            {selectedReel.image_url || selectedReel.thumbnail_url ? (
              <img
                src={selectedReel.image_url || selectedReel.thumbnail_url}
                alt={
                  selectedReel.caption
                    ? selectedReel.caption.slice(0, 100)
                    : `${platformInfo.label} Reel from ${
                        selectedReel.timestamp
                          ? new Date(selectedReel.timestamp).toLocaleDateString()
                          : "recent"
                      }`
                }
                className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0 bg-neutral-900"
              />
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                {selectedReel.caption || "No caption text provided for this post."}
              </p>
              {selectedReel.permalink && (
                <a
                  href={selectedReel.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-[#e5a93c] hover:underline mt-1 font-mono-ui"
                >
                  View live post &rarr;
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
