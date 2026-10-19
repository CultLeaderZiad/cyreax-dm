"use client"

import { useState, useEffect, useMemo } from "react"
import {
  AtSign, Heart, MessageSquare, Lock, Eye, Zap,
  ChevronRight, ChevronLeft, Loader2, Phone, Smile, Sparkles, Timer,
} from "lucide-react"
import type { ProButton, QuickReplyOption, Automation } from "@/lib/types"
import { toast } from "sonner"

/* ── Extracted sub-components ── */
import { AiIntentBuilder } from "@/components/dashboard/AiIntentBuilder"
import { TimelineStepper } from "@/components/dashboard/TimelineStepper"
import { ReelPostPicker } from "@/components/dashboard/ReelPostPicker"
import { KeywordMatchConfig } from "@/components/dashboard/KeywordMatchConfig"
import { ResponsePayloadConfig } from "@/components/dashboard/ResponsePayloadConfig"
import { RulePreviewPhone } from "@/components/dashboard/RulePreviewPhone"

/* ============================================================
   PLATFORM STYLE PRESETS
   Each platform gets its own accent colour, gradient, and icon
   ============================================================ */

const PLATFORM_STYLES: Record<string, {
  label: string
  accent: string        // CSS colour
  borderClass: string   // Tailwind border
  badgeBg: string       // Tailwind badge background
  badgeText: string     // Tailwind badge text
  icon: React.ReactNode
}> = {
  instagram: {
    label: "Instagram",
    accent: "#E1306C",
    borderClass: "border-pink-500/30",
    badgeBg: "bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888]",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  messenger: {
    label: "Messenger",
    accent: "#0084FF",
    borderClass: "border-blue-500/30",
    badgeBg: "bg-[#0084FF]",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.259L19.752 8.2l-6.561 6.763z" />
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    accent: "#1877F2",
    borderClass: "border-blue-600/30",
    badgeBg: "bg-[#1877F2]",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  telegram: {
    label: "Telegram",
    accent: "#24A1DE",
    borderClass: "border-sky-500/30",
    badgeBg: "bg-[#24A1DE]",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  whatsapp: {
    label: "WhatsApp",
    accent: "#25D366",
    borderClass: "border-green-500/30",
    badgeBg: "bg-[#25D366]",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    accent: "#ffffff",
    borderClass: "border-white/20",
    badgeBg: "bg-black",
    badgeText: "text-white",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z" />
      </svg>
    ),
  },
  webchat: {
    label: "Website",
    accent: "#e5a93c",
    borderClass: "border-[#e5a93c]/30",
    badgeBg: "bg-[#e5a93c]",
    badgeText: "text-black",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
      </svg>
    ),
  },
}

/* ============================================================
   SHARED FORM HELPERS
   ============================================================ */

function StepHeader({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="border-b border-white/5 pb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="px-2 py-0.5 rounded-md bg-[#e5a93c]/10 border border-[#e5a93c]/25 text-[9px] font-mono-ui font-bold uppercase tracking-wider text-[#e5a93c]">
          Phase {number}
        </div>
      </div>
      <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
      <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{description}</p>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono-ui text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500 mb-2">{children}</p>
}

function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#e5a93c]/50 focus:bg-white/[0.04] transition-all"
    />
  )
}

function ToggleRow({
  icon, title, sub, on, onToggle,
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
      className={`w-full p-4 rounded-2xl border text-left flex items-center gap-3.5 transition-all duration-200 bg-white/[0.01] ${
        on ? "border-[#e5a93c]/40 bg-[#e5a93c]/[0.03]" : "border-white/10 hover:border-white/20"
      }`}
    >
      <span className={on ? "text-[#e5a93c]" : "text-neutral-500"}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-neutral-500 mt-0.5 leading-relaxed">{sub}</span>
      </span>
      <span className={`w-10 h-5.5 rounded-full relative transition-colors shrink-0 ${on ? "bg-[#e5a93c]" : "bg-neutral-800"}`}>
        <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-black shadow-md transition-all ${on ? "left-[20px]" : "left-0.5"}`} />
      </span>
    </button>
  )
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

interface CreateRuleFormProps {
  userId: string
  triggerSource: "comment" | "dm" | "story"
  onSuccess: () => void
  editRule?: Automation | null
  initialIntent?: string
  defaultPlatform?: string
}

export function CreateRuleForm({ userId, triggerSource, onSuccess, editRule, initialIntent, defaultPlatform }: CreateRuleFormProps) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isEditing = Boolean(editRule?.id && UUID_REGEX.test(String(editRule.id)))
  const [step, setStep] = useState(0)

  /* ---------- WHEN ---------- */
  const [triggers, setTriggers] = useState<string[]>([])
  const [storyTriggerType, setStoryTriggerType] = useState<"mention" | "reaction" | "reply">("mention")
  const [selectedReel, setSelectedReel] = useState<any | null>(null)
  const [hasSelectedReelOption, setHasSelectedReelOption] = useState<boolean>(false)

  /* ---------- THEN ---------- */
  const [type, setType] = useState<"text" | "card" | "media">("text")
  const [messageText, setMessageText] = useState("")
  const [cardTitle, setCardTitle] = useState("")
  const [cardSubtitle, setCardSubtitle] = useState("")
  const [cardImage, setCardImage] = useState("")
  const [buttons, setButtons] = useState<ProButton[]>([])
  const [mediaUrl, setMediaUrl] = useState("")
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio">("image")
  const [quickReplies, setQuickReplies] = useState<QuickReplyOption[]>([])

  /* ---------- Public comment reply ---------- */
  const [replyMode, setReplyMode] = useState<"both" | "dm_only" | "public_only">("both")
  const [publicReplies, setPublicReplies] = useState<string[]>([])
  const [crossPostInstagram, setCrossPostInstagram] = useState(false)
  const [includeReplies, setIncludeReplies] = useState(false)

  /* ---------- EXTRAS ---------- */
  const [variants, setVariants] = useState<{ id: string, text: string, weight: number }[]>([])
  const [name, setName] = useState("")
  const [checkFollow, setCheckFollow] = useState(false)
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [typingIndicator, setTypingIndicator] = useState(false)

  /* ---------- LEAD CAPTURE ---------- */
  const [captureEmail, setCaptureEmail] = useState(false)
  const [capturePhone, setCapturePhone] = useState(false)
  const [captureName, setCaptureName] = useState(false)

  const [saving, setSaving] = useState(false)
  const [reels, setReels] = useState<any[]>([])
  const [loadingReels, setLoadingReels] = useState(false)

  /* ---------- AI ---------- */
  const [copySuggestions, setCopySuggestions] = useState<{id?: string, text: string}[]>([])
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [keywordSuggestions, setKeywordSuggestions] = useState<{id?: string, text: string}[]>([])
  const [generatingKeywords, setGeneratingKeywords] = useState(false)

  /* ---------- PROMPT 16 ADDITIONS ---------- */
  const [cardStyle, setCardStyle] = useState<"modern" | "classic" | "minimal">("modern")
  const [specificMediaUrl, setSpecificMediaUrl] = useState("")
  const [resolvingUrl, setResolvingUrl] = useState(false)
  const [platform, setPlatform] = useState<"instagram" | "messenger" | "facebook" | "telegram" | "whatsapp" | "tiktok" | "webchat">((defaultPlatform as any) || "instagram")
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>(["instagram"])

  const [intentDescription, setIntentDescription] = useState(initialIntent || "")
  const [parsingIntent, setParsingIntent] = useState(false)
  const [hasParsedInitialIntent, setHasParsedInitialIntent] = useState(false)

  /* ---------- PHONE PREVIEW SCALE ---------- */
  const [phoneScale, setPhoneScale] = useState<"mini" | "pro" | "pro-max">("pro")

  /* ── Platform style for this render ── */
  const ps = PLATFORM_STYLES[platform] || PLATFORM_STYLES.instagram
  const isMessagingOnlyPlatform = platform === "telegram" || platform === "whatsapp" || platform === "webchat"
  const effectiveTriggerSource = isMessagingOnlyPlatform ? "dm" : triggerSource

  /* ============================================================
     HANDLERS — kept in parent so sub-components stay stateless
     ============================================================ */

  const handleParseIntent = async (overrideDescription?: string) => {
    const descToParse = overrideDescription ?? intentDescription
    if (!descToParse.trim() || parsingIntent) return
    setParsingIntent(true)
    try {
      const res = await fetch("/api/ai/parse-automation-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descToParse })
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        if (data.trigger_value) {
           const parsedTriggers = data.trigger_value === "ALL" || data.trigger_value === "ALL_COMMENTS"
             ? []
             : data.trigger_value.split(",").map((t: string) => t.trim()).filter(Boolean)
           setTriggers(parsedTriggers)
        }
        if (data.response_type && ["text", "card", "media"].includes(data.response_type)) {
           setType(data.response_type)
        }
        if (data.draft_response_content) {
           setMessageText(data.draft_response_content)
        }
        toast.success("Form pre-filled based on your description!")
      }
    } catch {
      toast.error("Failed to parse your description")
    }
    setParsingIntent(false)
  }

  useEffect(() => {
    if (platform === "tiktok" && triggerSource === "comment") setHasSelectedReelOption(true)
  }, [platform, triggerSource])

  useEffect(() => {
    if (initialIntent && !hasParsedInitialIntent) {
      setHasParsedInitialIntent(true)
      handleParseIntent(initialIntent)
    }
  }, [initialIntent, hasParsedInitialIntent])

  useEffect(() => {
    // All supported channels are always available to create automations for
    const allPlatforms = ["instagram", "facebook", "messenger", "telegram", "whatsapp", "tiktok", "webchat"]
    setAvailablePlatforms(allPlatforms)
  }, [editRule, defaultPlatform])

  const handleResolveMediaUrl = async () => {
    if (!specificMediaUrl.trim()) return
    setResolvingUrl(true)
    try {
      const isFb = platform === "facebook" || platform === "messenger" || specificMediaUrl.includes("facebook.com") || specificMediaUrl.includes("fb.watch") || specificMediaUrl.includes("fb.me")
      const endpoint = isFb ? "/api/facebook/fetch-post" : "/api/instagram/fetch-post"

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: specificMediaUrl.trim() })
      })
      const data = await res.json()
      
      const post = data.post || data
      if (post?.id || post?.external_post_id) {
        const resolvedId = String(post.external_post_id || post.id)
        setSelectedReel({
          id: resolvedId,
          caption: post.caption || "Targeted Post",
          image_url: post.thumbnail_url || post.image_url || null,
          thumbnail_url: post.thumbnail_url || post.image_url || null,
          author_name: post.author_name || null,
          permalink: post.permalink || null,
          media_type: post.media_type || "POST",
        })
        setHasSelectedReelOption(true)
        toast.success(`${isFb ? "Facebook" : "Instagram"} post linked and verified!`)
      } else {
        toast.error(data.error || "Could not find post. Make sure the URL is public.")
      }
    } catch {
      toast.error("Failed to resolve URL. Please verify your connection.")
    }
    setResolvingUrl(false)
  }

  const handleGenerateKeywords = async () => {
    if (!triggers.length || generatingKeywords) return
    setGeneratingKeywords(true)
    try {
      const res = await fetch("/api/ai/keyword-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: editRule?.id, keywords: triggers.join(", ") })
      })
      const data = await res.json()
      if (data.suggestion) {
        setKeywordSuggestions([data.suggestion])
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to generate keywords")
    }
    setGeneratingKeywords(false)
  }

  const handleAcceptKeywords = async (suggestion: {id?: string, text: string}) => {
    const newKeywords = suggestion.text.split(",").map(k => k.trim()).filter(Boolean)
    setTriggers(newKeywords)
    setKeywordSuggestions([])
    if (suggestion.id) {
      fetch("/api/ai/keyword-suggestion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, accepted: true })
      }).catch(console.error)
    }
  }

  const handleGenerateCopy = async () => {
    if (!messageText || generatingCopy) return
    setGeneratingCopy(true)
    try {
      const res = await fetch("/api/ai/copy-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: editRule?.id, text: messageText })
      })
      const data = await res.json()
      if (data.suggestions) {
        setCopySuggestions(data.suggestions)
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to generate copy")
    }
    setGeneratingCopy(false)
  }

  const handleAcceptCopy = async (suggestion: {id?: string, text: string}) => {
    setMessageText(suggestion.text)
    setCopySuggestions([])
    if (suggestion.id) {
      fetch("/api/ai/copy-suggestion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, accepted: true })
      }).catch(console.error)
    }
  }

  useEffect(() => {
    if (!userId || (platform !== "instagram" && platform !== "facebook")) {
      setLoadingReels(false)
      setReels([])
      return
    }
    let cancelled = false
    setLoadingReels(true)
    const endpoint = platform === "facebook" ? `/api/facebook/posts` : `/api/instagram/media?userId=${userId}`
    fetch(endpoint)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const list = j.data && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : []
        setReels(list)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingReels(false))
    return () => { cancelled = true }
  }, [userId, platform])

  /* Prefill on edit */
  useEffect(() => {
    if (!editRule) return
    const content: any =
      typeof editRule.response_content === "string"
        ? JSON.parse(editRule.response_content as any)
        : editRule.response_content || {}

    setName(editRule.name)
    if (["mention", "reaction", "reply"].includes(editRule.trigger_type)) {
      setStoryTriggerType(editRule.trigger_type as any)
    }
    const rawTriggers = (editRule.trigger_value || "")
      .split(",").map((t) => t.trim())
      .filter((t) => t && !["ALL", "ALL_COMMENTS", "ALL_MENTIONS", "ALL_REACTIONS"].includes(t.toUpperCase()))
    setTriggers(rawTriggers)

    if (content.media?.url) {
      setType("media"); setMediaUrl(content.media.url); setMediaType(content.media.type || "image"); setMessageText(content.message || "")
    } else if (content.card) {
      setType("card"); setCardTitle(content.card.title || ""); setCardSubtitle(content.card.subtitle || ""); setCardImage(content.card.image_url || "")
      setCardStyle(content.card.card_style || "modern")
      setButtons((content.card.buttons || []).map((b: any, i: number) => ({ id: `${Date.now()}_${i}`, ...b })))
    } else {
      setType("text"); setMessageText(content.message || "")
    }
    setQuickReplies((content.quick_replies || []).map((q: any, i: number) => ({ id: `${Date.now()}_qr${i}`, title: q.title, payload: q.payload })))
    setReplyMode(content.reply_mode || "both")
    setPublicReplies(content.public_replies || [])
    setCrossPostInstagram(!!content.cross_post_instagram)
    setIncludeReplies(!!content.include_replies)
    setCheckFollow(!!content.check_follow)
    setDelaySeconds(content.delay_seconds || 0)
    setTypingIndicator(!!content.typing_indicator)

    if (content.lead_capture) {
      setCaptureEmail(!!content.lead_capture.require_email)
      setCaptureName(!!content.lead_capture.require_name)
      setCapturePhone(!!content.lead_capture.require_phone)
    }

    if (editRule.platform) {
      setPlatform(editRule.platform as any)
    }

    if (editRule.specific_media_id) {
      setSelectedReel({ id: editRule.specific_media_id, caption: "Selected post" })
      setHasSelectedReelOption(true)
    } else {
      // Global rule ("All Posts") -> selectedReel is null, but hasSelectedReelOption is true so Phase 1 is valid
      setSelectedReel(null)
      setHasSelectedReelOption(true)
    }

    setVariants((editRule.automation_variants || []).map((v: any) => ({
      id: v.id,
      text: v.response_config?.message || v.response_config?.reply_text || "Variant message",
      weight: v.traffic_weight || 50
    })))
  }, [editRule])

  /* Auto name */
  useEffect(() => {
    if (name || isEditing) return
    const isReplyAll = (effectiveTriggerSource === "comment" || effectiveTriggerSource === "dm") && triggers.length === 0
    if (isReplyAll) setName(isMessagingOnlyPlatform ? "Reply to every message" : "Reply to every comment")
    else if (triggers.length > 0) setName(`Reply to "${triggers[0]}"`)
  }, [triggers, name, isEditing, effectiveTriggerSource, isMessagingOnlyPlatform])

  /* ---------- helpers ---------- */
  const addButton = () => {
    if (buttons.length >= 3) return
    setButtons([...buttons, { id: Date.now().toString(), type: "web_url", title: "", url: "", payload: "" }])
  }
  const updateButton = (id: string, field: keyof ProButton, value: string) =>
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  const removeButton = (id: string) => setButtons(buttons.filter((b) => b.id !== id))

  const addQuickReply = () => {
    if (quickReplies.length >= 4) return
    setQuickReplies([...quickReplies, { id: Date.now().toString(), title: "" }])
  }
  const updateQuickReply = (id: string, title: string) =>
    setQuickReplies(quickReplies.map((q) => (q.id === id ? { ...q, title } : q)))
  const removeQuickReply = (id: string) => setQuickReplies(quickReplies.filter((q) => q.id !== id))

  const needsKeywords = effectiveTriggerSource === "dm" || (effectiveTriggerSource === "story" && storyTriggerType !== "mention")

  const whenValid = (effectiveTriggerSource === "comment" && !isMessagingOnlyPlatform)
    ? hasSelectedReelOption
    : true

  const thenValid =
    replyMode === "public_only" ||
    (type === "text" ? messageText.trim().length > 0 : type === "card" ? cardTitle.trim().length > 0 : mediaUrl.trim().length > 0)
  const canSave = whenValid && thenValid && name.trim().length > 0

  const stepValid = [
    whenValid,
    thenValid,
    name.trim().length > 0,
  ]

  /* Plain-language summary sentence */
  const summary = useMemo(() => {
    const isReplyAll = (effectiveTriggerSource === "comment" || effectiveTriggerSource === "dm") && triggers.length === 0
    const who =
      effectiveTriggerSource === "comment"
        ? isReplyAll ? "anyone comments on your post" : `someone comments ${triggers.length ? `"${triggers[0]}"` : "a keyword"}`
        : effectiveTriggerSource === "dm"
          ? isReplyAll ? (isMessagingOnlyPlatform ? `anyone messages your ${ps.label} bot` : "anyone DMs you") : `someone messages ${triggers.length ? `"${triggers[0]}"` : "a keyword"}`
          : storyTriggerType === "mention" ? "someone mentions you in a story"
            : storyTriggerType === "reaction" ? "someone reacts to your story"
              : "someone replies to your story"
    const what =
      replyMode === "public_only" ? "reply publicly"
        : type === "card" ? "send them a card with buttons"
          : type === "media" ? `send them ${mediaType === "image" ? "an image" : `a ${mediaType}`}`
            : "send them a message"
    return { who, what }
  }, [effectiveTriggerSource, triggers, storyTriggerType, replyMode, type, mediaType, isMessagingOnlyPlatform, ps.label])

  /* ---------- save ---------- */
  const handleSubmit = async () => {
    if (!canSave || saving) return
    setSaving(true)

    const isReplyAll = (effectiveTriggerSource === "comment" || effectiveTriggerSource === "dm") && triggers.length === 0

    const content: any = { check_follow: checkFollow }
    if (delaySeconds > 0) content.delay_seconds = delaySeconds
    if (typingIndicator) content.typing_indicator = true

    if (captureEmail || captureName || capturePhone) {
      content.lead_capture = {
        require_email: captureEmail,
        require_name: captureName,
        require_phone: capturePhone
      }
    }

    if (effectiveTriggerSource === "comment") {
      content.reply_mode = replyMode
      if (publicReplies.length > 0) content.public_replies = publicReplies
      if (includeReplies) content.include_replies = true
      if (platform === "tiktok" && crossPostInstagram) content.cross_post_instagram = true
    }
    if (quickReplies.filter((q) => q.title.trim()).length > 0) {
      content.quick_replies = quickReplies.filter((q) => q.title.trim()).map((q) => ({ title: q.title.trim(), payload: q.payload }))
    }

    if (type === "text") {
      content.message = messageText
    } else if (type === "media") {
      if (mediaUrl && !mediaUrl.startsWith("https://")) {
        toast.error("Media URL must use a secure HTTPS link.")
        setSaving(false)
        return
      }
      content.media = { type: mediaType, url: mediaUrl.trim() }
      if (messageText.trim()) content.message = messageText
    } else {

      const cleanButtons = buttons
        .map((b) => {
          if (b.type === "web_url") {
            let cleanUrl = b.url?.trim() || ""
            if (cleanUrl.startsWith("https://https://")) cleanUrl = cleanUrl.replace("https://https://", "https://")
            return { type: "web_url" as const, title: b.title, url: cleanUrl }
          }
          return { type: "postback" as const, title: b.title, payload: b.payload }
        })
        .filter((b) => b.title)
      content.card = { title: cardTitle, subtitle: cardSubtitle || undefined, image_url: undefined, buttons: cleanButtons, card_style: cardStyle }
    }

    const payload = {
      userId,
      name,
      trigger_source: effectiveTriggerSource,
      trigger_type: isReplyAll ? "reply_all" : effectiveTriggerSource === "story" ? storyTriggerType : "keyword",
      trigger_value: isReplyAll ? (effectiveTriggerSource === "comment" ? "ALL_COMMENTS" : "ALL")
        : effectiveTriggerSource === "story" && storyTriggerType === "mention" ? "ALL_MENTIONS"
          : effectiveTriggerSource === "story" && storyTriggerType === "reaction" && triggers.length === 0 ? "ALL_REACTIONS"
            : triggers.length > 0 ? triggers.join(", ") : "ALL",
      content,
      specific_media_id: (platform === "tiktok" || isMessagingOnlyPlatform) ? null : selectedReel?.id || null,
      platform,
      automation_variants: variants.map(v => ({
        id: v.id.startsWith("new_") ? undefined : v.id,
        response_config: { message: v.text },
        traffic_weight: v.weight
      }))
    }

    try {
      const res = await fetch("/api/automations", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { ...payload, id: editRule!.id } : payload),
      })
      if (res.ok) {
        toast.success(isEditing ? "Automation updated" : "Automation is live")
        onSuccess()
      } else {
        const errorData = await res.json().catch(() => ({}))
        toast.error(errorData.error || "Could not save — try again")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setSaving(false)
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="space-y-8">
      {/* ── Platform Badge Header ── */}
      <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border ${ps.borderClass} bg-white/[0.02]`}>
        <div className={`w-8 h-8 rounded-lg ${ps.badgeBg} ${ps.badgeText} flex items-center justify-center`}>
          {ps.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{ps.label} Automation</p>
          <p className="text-[10px] text-neutral-500 font-mono-ui uppercase tracking-wider">
            {isEditing ? "Editing Rule" : "New Rule"} · {triggerSource} trigger
          </p>
        </div>
        {availablePlatforms.length > 1 && (
          <div className="flex items-center gap-1">
            {availablePlatforms.map((p) => {
              const pStyle = PLATFORM_STYLES[p]
              if (!pStyle) return null
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p as any)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    platform === p
                      ? `${pStyle.badgeBg} ${pStyle.badgeText} ring-2 ring-white/20`
                      : "bg-white/5 text-neutral-500 hover:text-white hover:bg-white/10"
                  }`}
                  title={pStyle.label}
                >
                  {pStyle.icon}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── AI Intent Builder ── */}
      <AiIntentBuilder
        intentDescription={intentDescription}
        setIntentDescription={setIntentDescription}
        parsingIntent={parsingIntent}
        handleParseIntent={() => handleParseIntent()}
      />

      {/* ── Sexy Stepper Timeline ── */}
      <TimelineStepper step={step} setStep={setStep} stepValid={stepValid} />

      {/* ── Two Column Workspace ── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* ── LEFT: Config Form ── */}
        <div className={`bg-[#0b0b0a] border rounded-2xl p-6 md:p-8 space-y-6 ${ps.borderClass}`} style={{ borderColor: `${ps.accent}20` }}>
          {/* ===== STEP 1: TRIGGER ===== */}
          {step === 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={1}
                title={
                  isMessagingOnlyPlatform
                    ? `When someone messages your ${ps.label} bot`
                    : triggerSource === "comment"
                    ? "Select the target post/reel"
                    : triggerSource === "dm"
                    ? "When someone DMs you"
                    : "When someone interacts with your story"
                }
                description={
                  isMessagingOnlyPlatform
                    ? `Set the keywords that trigger automated replies on ${ps.label}.`
                    : triggerSource === "comment"
                    ? "Choose the specific media to automate."
                    : "Set the conditions that launch this automation."
                }
              />

              {isMessagingOnlyPlatform && (
                <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ps.badgeBg} ${ps.badgeText} shrink-0`}>
                    {ps.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">Direct Message Trigger</p>
                    <p className="text-[11px] text-neutral-400">
                      Triggers automatically whenever an incoming message is received on your {ps.label} bot.
                    </p>
                  </div>
                </div>
              )}

              {triggerSource === "story" && (
                <div className="space-y-3">
                  <FieldLabel>Select Story Interaction Type</FieldLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([
                      { key: "mention" as const, icon: <AtSign className="w-5 h-5" />, label: "Mentions me", desc: "Tagged in a story" },
                      { key: "reaction" as const, icon: <Heart className="w-5 h-5" />, label: "Reacts", desc: "Sends emoji reaction" },
                      { key: "reply" as const, icon: <MessageSquare className="w-5 h-5" />, label: "Replies", desc: "Text reply to story" },
                    ]).map(({ key, icon, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStoryTriggerType(key)}
                        className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all duration-200 ${
                          storyTriggerType === key
                            ? "border-[#e5a93c] bg-[#e5a93c]/[0.06] text-[#e5a93c]"
                            : "border-white/10 text-neutral-400 hover:border-white/20 hover:text-white bg-white/[0.01]"
                        }`}
                      >
                        <span className={storyTriggerType === key ? "text-[#e5a93c]" : "text-neutral-500"}>{icon}</span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
                          <p className="text-[10px] text-neutral-500 font-normal mt-0.5">{desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {triggerSource === "comment" && !isMessagingOnlyPlatform && platform === "tiktok" && (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    A keyword on a TikTok comment posts a public reply, for example “Check your DMs” or “DM us PRICE”. It does not DM that commenter. Comment-to-Message DMs stay limited to high-intent comments on accounts registered in Vietnam, Indonesia, or Thailand.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-neutral-300">
                    <input type="checkbox" checked={crossPostInstagram} onChange={(event) => setCrossPostInstagram(event.target.checked)} />
                    Also run this keyword as an Instagram comment-to-DM
                  </label>
                </div>
              )}

              {triggerSource === "comment" && !isMessagingOnlyPlatform && platform !== "tiktok" && (
                <ReelPostPicker
                  loadingReels={loadingReels}
                  reels={reels}
                  selectedReel={selectedReel}
                  setSelectedReel={setSelectedReel}
                  hasSelectedReelOption={hasSelectedReelOption}
                  setHasSelectedReelOption={setHasSelectedReelOption}
                  specificMediaUrl={specificMediaUrl}
                  setSpecificMediaUrl={setSpecificMediaUrl}
                  resolvingUrl={resolvingUrl}
                  handleResolveMediaUrl={handleResolveMediaUrl}
                  platform={platform}
                />
              )}

              {/* Configure keywords only after selection (for Comment triggers) or always for others */}
              {(effectiveTriggerSource !== "comment" || hasSelectedReelOption) && (
                <KeywordMatchConfig
                  triggerSource={effectiveTriggerSource}
                  storyTriggerType={storyTriggerType}
                  triggers={triggers}
                  setTriggers={setTriggers}
                  generatingKeywords={generatingKeywords}
                  handleGenerateKeywords={handleGenerateKeywords}
                  keywordSuggestions={keywordSuggestions}
                  handleAcceptKeywords={handleAcceptKeywords}
                  setKeywordSuggestions={setKeywordSuggestions}
                  includeReplies={includeReplies}
                  setIncludeReplies={setIncludeReplies}
                  needsKeywords={needsKeywords}
                />
              )}
            </div>
          )}

          {/* ===== STEP 2: RESPONSE ===== */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={2}
                title="Compose response message"
                description="Pick the format and craft the message sent to prospects."
              />
              <ResponsePayloadConfig
                triggerSource={triggerSource}
                replyMode={replyMode}
                setReplyMode={setReplyMode}
                publicReplies={publicReplies}
                setPublicReplies={setPublicReplies}
                type={type}
                setType={setType}
                messageText={messageText}
                setMessageText={setMessageText}
                cardTitle={cardTitle}
                setCardTitle={setCardTitle}
                cardSubtitle={cardSubtitle}
                setCardSubtitle={setCardSubtitle}
                cardImage={cardImage}
                setCardImage={setCardImage}
                cardStyle={cardStyle}
                setCardStyle={setCardStyle}
                buttons={buttons}
                addButton={addButton}
                updateButton={updateButton}
                removeButton={removeButton}
                mediaUrl={mediaUrl}
                setMediaUrl={setMediaUrl}
                mediaType={mediaType}
                setMediaType={setMediaType}
                quickReplies={quickReplies}
                addQuickReply={addQuickReply}
                updateQuickReply={updateQuickReply}
                removeQuickReply={removeQuickReply}
                variants={variants}
                setVariants={setVariants}
                generatingCopy={generatingCopy}
                handleGenerateCopy={handleGenerateCopy}
                copySuggestions={copySuggestions}
                setCopySuggestions={setCopySuggestions}
                handleAcceptCopy={handleAcceptCopy}
              />
            </div>
          )}

          {/* ===== STEP 3: SETTINGS ===== */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={3}
                title="Configure rules & name"
                description="Finalize performance parameters and activate the automation."
              />

              <div className="space-y-2">
                <FieldLabel>Automation identifier name</FieldLabel>
                <TextField value={name} onChange={setName} placeholder='e.g. "Free Ebook Download Trigger"' />
              </div>

              <div className="space-y-4">
                <FieldLabel>Delivery options</FieldLabel>
                {platform !== "telegram" && platform !== "whatsapp" && platform !== "tiktok" && platform !== "webchat" && (
                  <ToggleRow icon={<Lock className="w-5 h-5" />} title="Follow gate required" sub="Only followers get the payload. Non-followers get follow prompt first." on={checkFollow} onToggle={() => setCheckFollow(!checkFollow)} />
                )}
                <ToggleRow icon={<Eye className="w-5 h-5" />} title="Mimic active typing status" sub="Displays typing bubble indicators to look completely organic." on={typingIndicator} onToggle={() => setTypingIndicator(!typingIndicator)} />

                <FieldLabel>Lead Capture Sequence (Pre-Delivery)</FieldLabel>
                <ToggleRow icon={<Smile className="w-5 h-5" />} title="Ask for Name" sub="Capture the user's name first for personal, friendly follow-up." on={captureName} onToggle={() => setCaptureName(!captureName)} />
                <ToggleRow icon={<Phone className="w-5 h-5" />} title="Ask for Phone Number" sub="Capture mobile or WhatsApp number before sending the payload." on={capturePhone} onToggle={() => setCapturePhone(!capturePhone)} />
                <ToggleRow icon={<AtSign className="w-5 h-5" />} title="Ask for Email" sub="Capture the user's email address for confirmation and offers." on={captureEmail} onToggle={() => setCaptureEmail(!captureEmail)} />

                {platform !== "telegram" && platform !== "whatsapp" && platform !== "tiktok" && platform !== "webchat" && (
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-white/[0.01]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center border border-white/5">
                        <Timer className="w-4.5 h-4.5 text-neutral-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Randomized delivery delay</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Waits before sending to simulate real human delays.</p>
                      </div>
                    </div>
                    <select
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(Number(e.target.value))}
                      className="bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none hover:border-white/20 transition-all cursor-pointer"
                    >
                      <option value={0}>Send Immediately</option>
                      <option value={3}>3s delay</option>
                      <option value={5}>5s delay</option>
                      <option value={10}>10s delay</option>
                      <option value={30}>30s delay</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Plain-text Summary Panel */}
              <div className="rounded-xl border border-[var(--goldline)] bg-[var(--goldbg)] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                  <span className="text-xs font-mono text-[var(--gold)] font-medium">Rule logic summary</span>
                </div>
                <p className="text-xs text-[var(--t2)] leading-relaxed">
                  When <span className="text-[var(--t1)] font-semibold underline decoration-[var(--goldline)] decoration-2">{summary.who}</span>,
                  {delaySeconds > 0 ? ` after a ${delaySeconds}s delay` : ""}
                  {typingIndicator ? ` (with typing indicator)` : ""}
                  {checkFollow ? ` if they follow you` : ""}
                  , we will <span className="text-[var(--gold2)] font-semibold">{summary.what}</span>.
                </p>
              </div>
            </div>
          )}

          {/* ── Wizard Foot Navigation ── */}
          <div className="flex items-center justify-between border-t border-[var(--line)] pt-5">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-[7px] border border-[var(--line)] bg-[var(--s2)] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s3)] text-xs font-medium transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            ) : <div />}

            {step < 2 ? (
              <button
                type="button"
                onClick={() => { if (stepValid[step]) setStep(step + 1) }}
                disabled={!stepValid[step]}
                className="flex items-center gap-1.5 h-9 px-5 rounded-[7px] bg-[var(--gold)] text-black text-xs font-semibold hover:brightness-105 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto cursor-pointer"
              >
                <span>{step === 0 ? "Continue to message" : "Review & activate"}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave || saving}
                className="flex items-center justify-center gap-1.5 h-9 px-5 rounded-[7px] bg-[var(--gold)] text-black text-xs font-semibold hover:brightness-105 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{saving ? "Saving changes..." : isEditing ? "Save automation" : "Activate automation"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: iPhone Mockup ── */}
        <RulePreviewPhone
          userId={userId}
          editRule={editRule}
          triggerSource={triggerSource}
          triggers={triggers}
          type={type}
          messageText={messageText}
          cardTitle={cardTitle}
          cardSubtitle={cardSubtitle}
          cardImage={cardImage}
          cardStyle={cardStyle}
          buttons={buttons}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          quickReplies={quickReplies}
          replyMode={replyMode}
          typingIndicator={typingIndicator}
          captureName={captureName}
          captureEmail={captureEmail}
          capturePhone={capturePhone}
          phoneScale={phoneScale}
          setPhoneScale={setPhoneScale}
          platform={platform}
        />
      </div>
    </div>
  )
}
