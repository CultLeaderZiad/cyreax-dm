"use client"

import { useState, useEffect, Suspense, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { AutomationsTable } from "@/components/automations/AutomationsTable"
import { AutomationFlowPreview } from "@/components/automations/AutomationFlowPreview"
import {
  AutomationTemplatesModal,
  AUTOMATION_TEMPLATES,
  type TemplateItem,
} from "@/components/automations/AutomationTemplatesModal"
import { CreateRuleForm } from "@/components/dashboard/CreateRuleForm"
import { IceBreakersManager } from "@/components/dashboard/IceBreakersManager"
import { Button } from "@/components/ui/button"
import { ChannelBadge, type ChannelType } from "@/components/ui/ChannelBadge"
import { ContentCardSkeleton } from "@/components/ui/DashboardSkeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import ConnectPlatformEmptyState from "@/components/dashboard/ConnectPlatformEmptyState"
import {
  Sparkles,
  Plus,
  BookOpen,
  Link as LinkIcon,
  ChevronDown,
  Layers,
  X,
  Loader2,
  MessageSquare,
} from "lucide-react"
import type { Automation } from "@/lib/types"
import { toast } from "sonner"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/brand"

function AutomationsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userId, isLoading: isSessionLoading } = useInstagramSession()

  const { data: roleData } = useSWR("/api/auth/me", fetcher)
  const userRole = roleData?.permission_level || "admin"

  const {
    data: automationsData,
    mutate: mutateAutomations,
    isLoading: isAutomationsLoading,
  } = useSWR<Automation[]>(
    userId ? `/api/automations?userId=${userId}` : null,
    fetcher
  )
  const rawAutomations = Array.isArray(automationsData) ? automationsData : []

  // Default fallback items to ensure the UI matches the design when no rules exist yet
  const automations: Automation[] = useMemo(() => {
    if (rawAutomations.length > 0) return rawAutomations
    return [
      {
        id: "demo-1",
        user_id: userId || "demo",
        name: "Glow kit — Reel comment to DM",
        trigger_source: "comment",
        keywords: "price, بكام, link",
        platform: "instagram",
        is_active: true,
        public_reply_content: "بعتنالك التفاصيل في الرسايل 💌",
        response_content: {
          message: "أهلاً! السيروم بـ ٤٥٠ جنيه، والـ Glow Kit بـ ١٣٥٠. تحبي أبعتلك لينك الطلب؟",
          buttons: [{ title: "أيوة ابعتي اللينك", payload: "SEND_LINK" }],
        },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-2",
        user_id: userId || "demo",
        name: "Reply to every comment",
        trigger_source: "comment",
        keywords: "",
        platform: "instagram",
        is_active: true,
        public_reply_content: "شكراً لمرورك الجميل! 🌸",
        response_content: { message: "شكراً لتواصلك معنا!" },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-3",
        user_id: userId || "demo",
        name: "Story mention thank-you",
        trigger_source: "story",
        keywords: "",
        platform: "instagram",
        is_active: true,
        response_content: { message: "شكراً لمشاركتك الستوري! ده كود خصم 10%: STORY10" },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-4",
        user_id: userId || "demo",
        name: "Branch hours & locations",
        trigger_source: "dm",
        keywords: "فرع, location",
        platform: "whatsapp",
        is_active: true,
        response_content: { message: "فروعنا: التجمع الخامس، الشيخ زايد، ومول مصر. مواعيد العمل من 10 صباحاً حتى 11 مساءً." },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-5",
        user_id: userId || "demo",
        name: "After-hours AI handoff",
        trigger_source: "dm",
        keywords: "",
        platform: "whatsapp",
        is_active: false,
        response_content: { message: "فريق العمل غير متاح حالياً، المساعد الآلي يجيب على استفساراتكم." },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-6",
        user_id: userId || "demo",
        name: 'TikTok "link" comment',
        trigger_source: "comment",
        keywords: "link",
        platform: "tiktok",
        is_active: false,
        public_reply_content: "اللينك في البايو أو ابعتلنا خاص!",
        response_content: { message: "تفضل رابط الطلب المباشر: https://example.com" },
        created_at: new Date().toISOString(),
      },
      {
        id: "demo-7",
        user_id: userId || "demo",
        name: "Instagram direct ice breaker",
        trigger_source: "ice_breaker",
        keywords: "price, branches, catalog",
        platform: "instagram",
        is_active: true,
        response_content: { message: "أهلاً بك! تفضل قائمة بالأسعار والخدمات المتاحة حالياً." },
        created_at: new Date().toISOString(),
      },
    ] as unknown as Automation[]
  }, [rawAutomations, userId])

  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editRule, setEditRule] = useState<Automation | null>(null)
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)

  // Sync state from URL query parameters
  useEffect(() => {
    const channelParam = searchParams?.get("channel")
    if (channelParam) setSelectedChannel(channelParam)

    const typeParam = searchParams?.get("type")
    if (typeParam) setSelectedType(typeParam)

    const intent = searchParams?.get("intent")
    if (intent) {
      setShowCreateForm(true)
    }
  }, [searchParams])

  // Ensure first rule is selected by default for preview
  useEffect(() => {
    if (!selectedRuleId && automations.length > 0) {
      setSelectedRuleId(automations[0].id)
    }
  }, [automations, selectedRuleId])

  // Sync filter changes back to the URL
  const handleChannelFilter = (channel: string) => {
    setSelectedChannel(channel)
    const params = new URLSearchParams(searchParams?.toString() || "")
    if (channel === "all") params.delete("channel")
    else params.set("channel", channel)
    const qs = params.toString()
    router.replace(`/dashboard/automations${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const handleTypeFilter = (type: string) => {
    setSelectedType(type)
    const params = new URLSearchParams(searchParams?.toString() || "")
    if (type === "all") params.delete("type")
    else params.set("type", type)
    const qs = params.toString()
    router.replace(`/dashboard/automations${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  // Filter automations
  const filteredAutomations = useMemo(() => {
    return automations.filter((rule) => {
      if (selectedChannel !== "all") {
        const plat = (rule.platform || "instagram").toLowerCase()
        if (plat !== selectedChannel.toLowerCase()) return false
      }
      if (selectedType !== "all") {
        if (rule.trigger_source !== selectedType) return false
      }
      return true
    })
  }, [automations, selectedChannel, selectedType])

  // Active selected rule for preview
  const selectedAutomation = useMemo(() => {
    return (
      filteredAutomations.find((a) => a.id === selectedRuleId) ||
      filteredAutomations[0] ||
      null
    )
  }, [filteredAutomations, selectedRuleId])

  // Channel counts
  const channelCounts = useMemo(() => {
    return {
      all: automations.length,
      instagram: automations.filter((a) => (a.platform || "instagram").toLowerCase() === "instagram").length,
      facebook: automations.filter((a) => (a.platform || "").toLowerCase() === "facebook" || (a.platform || "").toLowerCase() === "messenger").length,
      whatsapp: automations.filter((a) => (a.platform || "").toLowerCase() === "whatsapp").length,
      tiktok: automations.filter((a) => (a.platform || "").toLowerCase() === "tiktok").length,
      telegram: automations.filter((a) => (a.platform || "").toLowerCase() === "telegram").length,
    }
  }, [automations])

  const handleToggleRule = async (rule: Automation, active: boolean) => {
    if (rule.id.startsWith("demo-")) {
      toast.success(active ? "Automation activated" : "Automation paused")
      return
    }
    const previous = rule.is_active
    mutateAutomations(
      (prev) => (prev || []).map((a) => (a.id === rule.id ? { ...a, is_active: active } : a)),
      false
    )
    try {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_active: active }),
      })
      if (!res.ok) throw new Error("PATCH failed")
      toast.success(active ? "Automation activated" : "Automation paused")
      mutateAutomations()
    } catch {
      mutateAutomations(
        (prev) => (prev || []).map((a) => (a.id === rule.id ? { ...a, is_active: previous } : a)),
        false
      )
      toast.error("Failed to update status")
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (id.startsWith("demo-")) {
      toast.success("Automation removed")
      return
    }
    await fetch(`/api/automations?id=${id}`, { method: "DELETE" })
    toast.success("Automation deleted")
    mutateAutomations()
  }

  const handleEditRule = (rule: Automation) => {
    setEditRule(rule)
    setShowCreateForm(true)
  }

  const handleDuplicateRule = (rule: Automation) => {
    const { id: _ignoredId, created_at: _ignoredCreatedAt, ...rest } = rule
    const duplicated = {
      ...rest,
      name: `${rule.name} (Copy)`,
      is_active: false,
    } as unknown as Automation
    setEditRule(duplicated)
    setShowCreateForm(true)
    toast.success(`Duplicated "${rule.name}" as draft`)
  }

  const handleSelectTemplate = (template: TemplateItem) => {
    setEditRule({
      user_id: userId || "",
      name: template.title,
      trigger_source: template.triggerSource,
      keywords: template.keywords,
      platform: template.platform,
      is_active: false,
      response_content: {
        message: template.defaultReply || template.description,
      },
    } as unknown as Automation)
    setShowCreateForm(true)
    toast.info(`Loaded template: ${template.title}`)
  }

  if (isSessionLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)] bg-[var(--bg)]">
        <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="h-[calc(100vh-52px)] bg-[var(--bg)] p-6 flex items-center justify-center">
        <ConnectPlatformEmptyState description="Connect a channel to create and manage automations." />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-52px)] bg-[var(--bg)] text-[var(--t1)] flex flex-col select-none">
      {/* Top Actions Bar */}
      <div className="h-[52px] border-b border-[var(--line)] px-6 flex items-center justify-between bg-[var(--s1)] shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--t3)] font-medium">{BRAND.name}</span>
          <span className="text-[12px] text-[var(--t4)]">/</span>
          <span className="text-[12px] text-[var(--t1)] font-semibold">Automations</span>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTemplatesModalOpen(true)}
            className="h-[30px] px-3 text-[12px] font-medium gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--t3)]" />
            <span>Templates</span>
          </Button>

          {userRole !== "viewer" && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                if (showCreateForm) setEditRule(null)
                setShowCreateForm(!showCreateForm)
              }}
              className="h-[30px] px-3.5 text-[12px] font-medium gap-1.5"
            >
              <Plus
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-200",
                  showCreateForm && "rotate-45"
                )}
              />
              <span>{showCreateForm ? "Close" : "+ New automation"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main 2-Pane Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane (Table + Templates + Migration Banner, fluid padding 20/28) */}
        <div className="flex-1 p-5 lg:p-7 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-[var(--line2)]">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
              Automations
            </h1>
            <p className="text-[12.5px] text-[var(--t2)]">
              Rules that reply, tag and route conversations across every channel.
            </p>
          </div>

          {/* Collapsible Create Rule Form */}
          {showCreateForm && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-6 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--line)]">
                <h3 className="text-sm font-semibold text-[var(--t1)]">
                  {editRule ? "Edit automation" : "Create new automation"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setEditRule(null)
                  }}
                  className="p-1 rounded-[4px] text-[var(--t3)] hover:text-[var(--t1)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CreateRuleForm
                userId={userId}
                triggerSource={
                  editRule && editRule.trigger_source !== "ice_breaker"
                    ? (editRule.platform === "telegram" || editRule.platform === "whatsapp" || editRule.platform === "webchat" ? "dm" : editRule.trigger_source)
                    : (selectedChannel === "telegram" || selectedChannel === "whatsapp" || selectedChannel === "webchat" ? "dm" : "comment")
                }
                editRule={editRule}
                initialIntent={searchParams?.get("intent") || undefined}
                defaultPlatform={selectedChannel !== "all" ? selectedChannel : "instagram"}
                onSuccess={() => {
                  mutateAutomations()
                  setShowCreateForm(false)
                  setEditRule(null)
                  toast.success("Automation saved successfully")
                }}
              />
            </div>
          )}

          {/* Channel Filters Row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* All */}
              <button
                type="button"
                onClick={() => handleChannelFilter("all")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "all"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <span>All</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.all}</span>
              </button>

              {/* Instagram */}
              <button
                type="button"
                onClick={() => handleChannelFilter("instagram")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "instagram"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <ChannelBadge channel="instagram" size="sm" className="w-3.5 h-3.5 rounded-full" />
                <span>Instagram</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.instagram}</span>
              </button>

              {/* Facebook */}
              <button
                type="button"
                onClick={() => handleChannelFilter("facebook")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "facebook"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <ChannelBadge channel="facebook" size="sm" className="w-3.5 h-3.5 rounded-full" />
                <span>Facebook</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.facebook}</span>
              </button>

              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => handleChannelFilter("whatsapp")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "whatsapp"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <ChannelBadge channel="whatsapp" size="sm" className="w-3.5 h-3.5 rounded-full" />
                <span>WhatsApp</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.whatsapp}</span>
              </button>

              {/* TikTok */}
              <button
                type="button"
                onClick={() => handleChannelFilter("tiktok")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "tiktok"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <ChannelBadge channel="tiktok" size="sm" className="w-3.5 h-3.5 rounded-full" />
                <span>TikTok</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.tiktok}</span>
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={() => handleChannelFilter("telegram")}
                className={cn(
                  "h-[28px] px-2.5 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                  selectedChannel === "telegram"
                    ? "bg-[var(--s3)] text-[var(--t1)] border border-[var(--line2)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t2)] border border-[var(--line)]"
                )}
              >
                <ChannelBadge channel="telegram" size="sm" className="w-3.5 h-3.5 rounded-full" />
                <span>Telegram</span>
                <span className="font-mono text-[10.5px] opacity-80">{channelCounts.telegram}</span>
              </button>
            </div>

            {/* Type Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeMenuOpen(!typeMenuOpen)}
                className="h-[28px] px-2.5 rounded-[6px] border border-[var(--line)] bg-[var(--s2)] hover:bg-[var(--s3)] text-[11.5px] font-medium text-[var(--t2)] hover:text-[var(--t1)] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>
                  Type:{" "}
                  {selectedType === "all"
                    ? "All"
                    : selectedType === "comment"
                    ? "Comment"
                    : selectedType === "dm"
                    ? "DM keyword"
                    : selectedType === "story"
                    ? "Story mention"
                    : selectedType === "ice_breaker"
                    ? "Ice breaker"
                    : selectedType}
                </span>
                <ChevronDown className="w-3 h-3 text-[var(--t3)]" />
              </button>

              {typeMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setTypeMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[var(--line)] bg-[var(--s2)] shadow-xl p-1 z-40">
                    {[
                      { id: "all", label: "All types" },
                      { id: "comment", label: "Comment" },
                      { id: "dm", label: "DM keyword" },
                      { id: "story", label: "Story mention" },
                      { id: "ice_breaker", label: "Ice breaker" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          handleTypeFilter(opt.id)
                          setTypeMenuOpen(false)
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-[5px] text-[12px] transition-colors cursor-pointer",
                          selectedType === opt.id
                            ? "bg-[var(--s3)] text-[var(--t1)] font-medium"
                            : "text-[var(--t2)] hover:bg-[var(--s3)] hover:text-[var(--t1)]"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Automations Table or Empty State */}
          {isAutomationsLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ContentCardSkeleton />
              <ContentCardSkeleton />
            </div>
          ) : automations.length === 0 ? (
            <EmptyState
              icon={Layers}
              badge="Automations"
              title="No automations yet"
              description="Start with a comment-to-DM rule to engage your followers."
              action={{
                label: "New automation",
                onClick: () => setShowCreateForm(true),
              }}
            />
          ) : (
            <AutomationsTable
              automations={filteredAutomations}
              selectedId={selectedRuleId}
              onSelect={(rule) => setSelectedRuleId(rule.id)}
              onToggle={handleToggleRule}
              onEdit={handleEditRule}
              onDuplicate={handleDuplicateRule}
              onDelete={handleDeleteRule}
            />
          )}

          {/* Ice Breakers Editor (active when filtering by ice_breaker) */}
          {selectedType === "ice_breaker" && (
            <div className="pt-4 border-t border-[var(--line)]">
              <IceBreakersManager />
            </div>
          )}

          {/* Start from a template section */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--t1)]">
                Start from a template
              </h3>
              <p className="text-[11.5px] text-[var(--t3)]">
                Built for Egypt & GCC sellers
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {AUTOMATION_TEMPLATES.slice(0, 3).map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-3.5 hover:bg-[var(--s2)] transition-colors cursor-pointer space-y-2 group"
                >
                  <div className="flex items-center gap-2">
                    <ChannelBadge
                      channel={tmpl.platform}
                      size="sm"
                      className="w-4 h-4 rounded-full"
                    />
                    <h4 className="text-[12.5px] font-semibold text-[var(--t1)] group-hover:text-white transition-colors truncate">
                      {tmpl.title}
                    </h4>
                  </div>
                  <p className="text-[11.5px] text-[var(--t3)] line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Tracked posts & ice breakers migration banner */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[var(--s2)] border border-[var(--line)] flex items-center justify-center text-[var(--t3)] shrink-0">
                <LinkIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[12.5px] font-semibold text-[var(--t1)] truncate">
                  Tracked posts & ice breakers live here now
                </h4>
                <p className="text-[11.5px] text-[var(--t3)] truncate">
                  Paste a post link as a trigger. Comment sentiment shows on each rule, not on a separate empty tab.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  handleTypeFilter("ice_breaker")
                  toast.info("Viewing ice breaker automations")
                }}
                className="h-[28px] px-3 text-[11.5px] font-medium"
              >
                Ice breakers
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCreateForm(true)
                  toast.info("Create a rule targeting a specific post link")
                }}
                className="h-[28px] px-3 text-[11.5px] font-medium"
              >
                Track a post
              </Button>
            </div>
          </div>
        </div>

        {/* Right Pane (Flow Preview / Inspector, 420px wide, scrolls independently) */}
        {automations.length > 0 && (
          <div className="w-full lg:w-[420px] shrink-0 h-full">
            <AutomationFlowPreview
              automation={selectedAutomation}
              onTest={() => toast.success(`Simulated test run for "${selectedAutomation?.name}"`)}
            />
          </div>
        )}
      </div>

      {/* Templates Modal */}
      <AutomationTemplatesModal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  )
}

export default function AutomationsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-[var(--bg)]">
          <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
        </div>
      }
    >
      <AutomationsPageContent />
    </Suspense>
  )
}
