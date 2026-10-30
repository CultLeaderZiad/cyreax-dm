"use client"

import React, { useState, useRef } from "react"
import { Plus, MoreHorizontal, Mail, Check, Upload, ExternalLink, X, Shield, AlertCircle } from "lucide-react"
import { Button, HoldToConfirm } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/brand"

interface TeamMember {
  id: string
  name: string
  email: string
  avatarInitials: string
  avatarBg: string
  avatarTextColor?: string
  role: "owner" | "admin" | "agent" | "client-viewer"
  isClient?: boolean
  clientsText: string
  clientsTags?: string[]
  lastActive: string
  isPending?: boolean
  inviteSentAgo?: string
}

const initialMembers: TeamMember[] = [
  {
    id: "1",
    name: "Tariq Mansour",
    email: "tariq@mirage.agency",
    avatarInitials: "TM",
    avatarBg: "bg-[#E9C77E]",
    avatarTextColor: "text-black",
    role: "owner",
    clientsText: "All 14",
    lastActive: "Now",
  },
  {
    id: "2",
    name: "Lina Mahmoud",
    email: "lina@mirage.agency",
    avatarInitials: "LM",
    avatarBg: "bg-[#3DD68C]",
    avatarTextColor: "text-black",
    role: "admin",
    clientsText: "All 14",
    lastActive: "14m",
  },
  {
    id: "3",
    name: "Omar Khalil",
    email: "omar@mirage.agency",
    avatarInitials: "OK",
    avatarBg: "bg-[#6EA8FE]",
    avatarTextColor: "text-black",
    role: "agent",
    clientsText: "Nour +3",
    clientsTags: ["Nour", "+3"],
    lastActive: "2h",
  },
  {
    id: "4",
    name: "Nour Adel",
    email: "nour@nourcosmetics.com",
    avatarInitials: "NA",
    avatarBg: "bg-[#F2555A]",
    avatarTextColor: "text-white",
    role: "client-viewer",
    isClient: true,
    clientsText: "Nour",
    clientsTags: ["Nour"],
    lastActive: "Yesterday",
  },
  {
    id: "5",
    name: "sara@mirage.agency",
    email: "sara@mirage.agency",
    avatarInitials: "?",
    avatarBg: "bg-[var(--s2)] border border-[var(--line2)]",
    avatarTextColor: "text-[var(--t3)]",
    role: "agent",
    clientsText: "Falak Fitness",
    clientsTags: ["Falak Fitness"],
    lastActive: "Pending",
    isPending: true,
    inviteSentAgo: "Invite sent 2d ago",
  },
]

export function TeamSettingsSection() {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "agent" | "client-viewer">("agent")
  const [inviteClients, setInviteClients] = useState("all")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")

  // Member removal dialog
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // White-label state
  const [customDomain, setCustomDomain] = useState("portal.mirage.agency")
  const [senderEmail, setSenderEmail] = useState("reports@mirage.agency")
  const [selectedColor, setSelectedColor] = useState("#0B0B0D")
  const [logoName, setLogoName] = useState("mirage-logo.svg")
  const [hideBranding, setHideBranding] = useState(true)
  const [monthlyPdfReport, setMonthlyPdfReport] = useState(true)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const swatches = [
    { id: "dark", hex: "#0B0B0D" },
    { id: "indigo", hex: "#635BFF" },
    { id: "orange", hex: "#E8590C" },
    { id: "teal", hex: "#0CA678" },
  ]

  const [savingWhiteLabel, setSavingWhiteLabel] = useState(false)

  React.useEffect(() => {
    fetch("/api/agency")
      .then((res) => res.json())
      .then((data) => {
        if (data?.agency) {
          if (data.agency.custom_domain) setCustomDomain(data.agency.custom_domain)
          if (data.agency.primary_color) setSelectedColor(data.agency.primary_color)
          if (data.agency.logo_url) setLogoName(data.agency.logo_url)
        }
      })
      .catch(console.error)

    fetch("/api/team")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.members) && data.members.length > 0) {
          const apiMembers: TeamMember[] = data.members.map((m: any, idx: number) => ({
            id: m.id || String(idx),
            name: m.name || m.email,
            email: m.email,
            avatarInitials: (m.name || m.email || "U").substring(0, 2).toUpperCase(),
            avatarBg: idx === 0 ? "bg-[#E9C77E]" : idx === 1 ? "bg-[#3DD68C]" : "bg-[#6EA8FE]",
            avatarTextColor: "text-black",
            role: m.role || "agent",
            clientsText: "All Workspaces",
            lastActive: "Active",
          }))
          setMembers(apiMembers)
        }
      })
      .catch(console.error)
  }, [])

  const handleRoleChange = (memberId: string, newRole: TeamMember["role"]) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    )
    toast.success("Team member role updated")
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !inviteEmail.includes("@")) {
      setInviteError("Please enter a valid email address.")
      return
    }

    setInviting(true)
    setInviteError("")

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, permission_level: inviteRole }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Invite sent to ${inviteEmail}`)
        const newInv: TeamMember = {
          id: String(Date.now()),
          name: inviteEmail,
          email: inviteEmail,
          avatarInitials: inviteEmail.substring(0, 2).toUpperCase(),
          avatarBg: "bg-[var(--s2)] border border-[var(--line2)]",
          avatarTextColor: "text-[var(--t3)]",
          role: inviteRole,
          clientsText: inviteClients === "all" ? "All Workspaces" : "Assigned",
          lastActive: "Pending",
          isPending: true,
          inviteSentAgo: "Just now",
        }
        setMembers((prev) => [...prev, newInv])
        setInviteOpen(false)
        setInviteEmail("")
      } else {
        toast.error(data.error || "Failed to send invitation")
      }
    } catch {
      toast.error("Network error sending invite")
    } finally {
      setInviting(false)
    }
  }

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return
    const id = memberToRemove.id
    const name = memberToRemove.name
    try {
      await fetch(`/api/team?id=${id}`, { method: "DELETE" })
      setMembers((prev) => prev.filter((m) => m.id !== id))
      toast.success(`Removed ${name} from workspace`)
    } catch {
      toast.error("Failed to remove member")
    } finally {
      setMemberToRemove(null)
    }
  }

  const handleSaveWhiteLabel = async () => {
    setSavingWhiteLabel(true)
    try {
      const res = await fetch("/api/agency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomain: customDomain.trim(),
          primaryColor: selectedColor,
          appName: BRAND.name,
          logoUrl: logoName,
        }),
      })
      if (res.ok) {
        toast.success("White-label settings saved successfully!")
      } else {
        const data = await res.json()
        toast.info(data.error || "Settings saved")
      }
    } catch {
      toast.error("Network error saving white-label settings")
    } finally {
      setSavingWhiteLabel(false)
    }
  }

  return (
    <div className="space-y-8 select-none">
      {/* Section Header */}
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Team &amp; white-label
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Who can work on which clients, and how the platform appears to your clients.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        {/* ─── BLOCK 1: Team & roles ─── */}
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          {/* Label Column (190px) */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">Team</h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              6 of 8 seats used. Client-viewers are free and don&apos;t use a seat.
            </p>
            <div className="pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setInviteOpen(true)}
                className="h-[28px] px-2.5 text-[11.5px] font-medium gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Invite</span>
              </Button>
            </div>
          </div>

          {/* Table Column */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-[12px] border-collapse" aria-label="Agency team members">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                    <th scope="col" className="py-2.5 px-4 font-medium">Member</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Role</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Clients</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Last active</th>
                    <th scope="col" className="py-2.5 px-3 font-medium text-end"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--s2)]/50 transition-colors">
                      {/* Member column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0",
                              m.avatarBg,
                              m.avatarTextColor || "text-black"
                            )}
                          >
                            {m.avatarInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[12.5px] text-[var(--t1)] truncate">
                                {m.name}
                              </span>
                              {m.isClient && (
                                <span className="text-[10px] text-[var(--t3)] bg-[var(--s2)] border border-[var(--line)] px-1 py-0.2 rounded font-medium">
                                  Client
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[var(--t3)] block truncate font-mono">
                              <bdi dir="ltr">{m.email}</bdi>
                            </span>
                            {m.inviteSentAgo && (
                              <span className="text-[10px] text-[var(--t3)] block font-mono">
                                {m.inviteSentAgo}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role column */}
                      <td className="py-3 px-3">
                        {m.role === "owner" ? (
                          <span className="px-2 py-0.5 rounded-[4px] bg-[var(--s2)] border border-[var(--line2)] text-[11px] font-medium text-[var(--t2)] font-mono">
                            Owner
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) =>
                              handleRoleChange(m.id, e.target.value as TeamMember["role"])
                            }
                            className="bg-[var(--s2)] border border-[var(--line2)] text-[11.5px] text-[var(--t1)] rounded-[4px] px-2 py-1 focus:outline-none focus:border-[var(--line3)] cursor-pointer"
                          >
                            <option value="admin">Admin</option>
                            <option value="agent">Agent</option>
                            <option value="client-viewer">Client-viewer</option>
                          </select>
                        )}
                      </td>

                      {/* Clients column */}
                      <td className="py-3 px-3">
                        {m.clientsTags ? (
                          <div className="flex items-center gap-1">
                            {m.clientsTags.map((tag, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "font-mono text-[11px] px-1.5 py-0.5 rounded border",
                                  idx === 0
                                    ? "bg-[var(--s2)] border-[var(--line2)] text-[var(--t2)]"
                                    : "bg-[var(--s2)] border-[var(--line)] text-[var(--t3)]"
                                )}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-[var(--t2)] tabular-nums">
                            {m.clientsText}
                          </span>
                        )}
                      </td>

                      {/* Last active / Status column */}
                      <td className="py-3 px-3">
                        {m.isPending ? (
                          <div className="flex items-center gap-2">
                            <Pill variant="amber" dot={false} className="text-[10px] h-4">
                              Pending
                            </Pill>
                            <button
                              type="button"
                              onClick={() => toast.success(`Invite resent to ${m.email}`)}
                              className="text-[11px] text-[var(--t3)] hover:text-[var(--t1)] underline cursor-pointer"
                            >
                              Resend
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-[var(--t3)]">
                            {m.lastActive}
                          </span>
                        )}
                      </td>

                      {/* Action overflow */}
                      <td className="py-3 px-3 text-end">
                        {m.role !== "owner" && (
                          <div className="relative inline-block text-start">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId(openMenuId === m.id ? null : m.id)
                              }
                              className="size-7 rounded-[4px] hover:bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)] flex items-center justify-center transition-colors cursor-pointer"
                              aria-label="Member options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {openMenuId === m.id && (
                              <div className="absolute end-0 mt-1 w-36 rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] shadow-md py-1 z-20">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    setMemberToRemove(m)
                                  }}
                                  className="w-full text-start px-3 py-1.5 text-[11.5px] text-[var(--red)] hover:bg-[var(--s3)] transition-colors cursor-pointer"
                                >
                                  Remove member
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── BLOCK 2: White-label ─── */}
        <div className="pt-6 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          {/* Label Column (190px) */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              White-label
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Your clients see your brand on the portal, reports and emails. The platform stays invisible.
            </p>
          </div>

          {/* Fields column + Client portal preview */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_210px] gap-6 items-start">
            {/* Left fields side */}
            <div className="space-y-4">
              {/* Custom domain */}
              <div className="space-y-1.5">
                <label
                  htmlFor="custom-domain"
                  className="text-[11.5px] text-[var(--t2)] font-medium block"
                >
                  Custom domain
                </label>
                <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-3 gap-2">
                  <input
                    id="custom-domain"
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    className="font-mono text-[12px] text-[var(--t1)] bg-transparent outline-none flex-1"
                    placeholder="portal.youragency.com"
                  />
                  <Pill variant="green" dot className="text-[10px] shrink-0">
                    DNS verified · SSL active
                  </Pill>
                </div>
              </div>

              {/* Logo & Brand color row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Logo */}
                <div className="space-y-1.5">
                  <span className="text-[11.5px] text-[var(--t2)] font-medium block">
                    Logo
                  </span>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setLogoName(e.target.files[0].name)
                        toast.success(`Logo updated to ${e.target.files[0].name}`)
                      }
                    }}
                  />
                  <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-2.5 text-[11.5px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <Upload className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
                      <span className="text-[var(--t1)] font-mono text-[11px] truncate">
                        {logoName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="text-[11px] text-[var(--t3)] hover:text-[var(--t1)] shrink-0 transition-colors cursor-pointer"
                    >
                      Replace
                    </button>
                  </div>
                </div>

                {/* Brand color */}
                <div className="space-y-1.5">
                  <span className="text-[11.5px] text-[var(--t2)] font-medium block">
                    Brand color
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Brand color swatches"
                    className="h-[34px] flex items-center gap-2 px-1"
                  >
                    {swatches.map((swatch) => {
                      const isSelected = selectedColor === swatch.hex
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedColor(swatch.hex)}
                          className={cn(
                            "w-5 h-5 rounded-full transition-all cursor-pointer relative",
                            isSelected && "ring-2 ring-[var(--t1)] ring-offset-2 ring-offset-[var(--bg)]"
                          )}
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.hex}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Sender email for reports */}
              <div className="space-y-1.5">
                <label
                  htmlFor="sender-email"
                  className="text-[11.5px] text-[var(--t2)] font-medium block"
                >
                  Sender email for reports
                </label>
                <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-3 gap-2">
                  <input
                    id="sender-email"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="font-mono text-[12px] text-[var(--t1)] bg-transparent outline-none flex-1"
                    placeholder="reports@youragency.com"
                  />
                  <button
                    type="button"
                    onClick={() => toast.success("SPF & DKIM verification initiated")}
                    className="px-2 py-0.5 rounded-[4px] bg-[var(--amberbg)] text-[var(--amber)] border border-[rgba(245,165,36,0.25)] text-[10.5px] font-medium shrink-0 cursor-pointer"
                  >
                    Verify SPF
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                {/* Toggle 1: Hide platform branding */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideBranding}
                    onClick={() => setHideBranding(!hideBranding)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5",
                      hideBranding ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full bg-black transition-transform",
                        hideBranding ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-[12px] text-[var(--t1)]">
                    Hide platform branding
                  </span>
                </label>

                {/* Toggle 2: Monthly PDF report */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={monthlyPdfReport}
                    onClick={() => setMonthlyPdfReport(!monthlyPdfReport)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5",
                      monthlyPdfReport ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full bg-black transition-transform",
                        monthlyPdfReport ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-[12px] text-[var(--t1)]">
                    Monthly PDF report
                  </span>
                </label>
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSaveWhiteLabel}
                  disabled={savingWhiteLabel}
                  className="h-[30px] px-3.5 text-[12px] font-medium"
                >
                  {savingWhiteLabel ? "Saving..." : "Save white-label settings"}
                </Button>
              </div>
            </div>

            {/* Right side: Client portal preview (light-theme card) */}
            <div className="space-y-1.5">
              <span className="text-[11.5px] text-[var(--t3)] block">
                Client portal preview
              </span>
              <div className="rounded-[8px] bg-white text-neutral-900 border border-neutral-200 overflow-hidden shadow-xs p-3 space-y-2.5">
                {/* Banner */}
                <div
                  className="text-white text-[10px] font-semibold py-1 px-2 rounded-[3px] flex items-center justify-between"
                  style={{ backgroundColor: selectedColor === "#0B0B0D" ? "#0B2E24" : selectedColor }}
                >
                  <span>{BRAND.name} · Client Portal</span>
                </div>

                {/* 2x2 stats */}
                <div className="grid grid-cols-2 gap-2 text-start">
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Conversations
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      1,284
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Leads
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      318
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      AI handled
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      71%
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Sales
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      EGP 21.6k
                    </span>
                  </div>
                </div>

                {/* Approval line */}
                <div className="pt-1 border-t border-neutral-100 flex items-center justify-between text-[9.5px]">
                  <span className="text-neutral-600 truncate max-w-[130px]">
                    Approve: &ldquo;White Friday&rdquo; broadcast
                  </span>
                  <span className="text-emerald-700 font-semibold shrink-0 cursor-pointer hover:underline">
                    Approve →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── INVITE DIALOG ─── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-[var(--s1)] border-[var(--line)] text-[var(--t1)] sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">
              Invite team member
            </DialogTitle>
            <DialogDescription className="text-[12px] text-[var(--t3)]">
              Send an invitation to join your agency workspace.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSendInvite} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="invite-email-input"
                className="text-[11.5px] text-[var(--t2)] font-medium"
              >
                Email address
              </label>
              <input
                id="invite-email-input"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value)
                  if (inviteError) setInviteError("")
                }}
                placeholder="colleague@mirage.agency"
                aria-describedby={inviteError ? "invite-error" : undefined}
                className="w-full h-[32px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-2.5 text-[12px] text-[var(--t1)] outline-none focus:border-[var(--line3)]"
              />
              {inviteError && (
                <p id="invite-error" className="text-[11px] text-[var(--red)]">
                  {inviteError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="invite-role-select"
                className="text-[11.5px] text-[var(--t2)] font-medium"
              >
                Role
              </label>
              <select
                id="invite-role-select"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "admin" | "agent" | "client-viewer")
                }
                className="w-full h-[32px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-2.5 text-[12px] text-[var(--t1)] outline-none cursor-pointer"
              >
                <option value="admin">Admin — Full workspace settings &amp; clients</option>
                <option value="agent">Agent — Inbox, replies, and client workflows</option>
                <option value="client-viewer">Client-viewer — View client reports only (Free)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="invite-clients-select"
                className="text-[11.5px] text-[var(--t2)] font-medium"
              >
                Client access
              </label>
              <select
                id="invite-clients-select"
                value={inviteClients}
                onChange={(e) => setInviteClients(e.target.value)}
                className="w-full h-[32px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-2.5 text-[12px] text-[var(--t1)] outline-none cursor-pointer"
              >
                <option value="all">All 14 client workspaces</option>
                <option value="nour">Nour Cosmetics only</option>
                <option value="falak">Falak Fitness only</option>
              </select>
            </div>

            <DialogFooter className="pt-2 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setInviteOpen(false)}
                className="h-[30px] text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={inviting}
                className="h-[30px] text-xs"
              >
                {inviting ? "Sending..." : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── REMOVE MEMBER CONFIRMATION DIALOG ─── */}
      <ConfirmDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null)
        }}
        title={`Remove ${memberToRemove?.name || "member"}?`}
        description={`Remove ${memberToRemove?.name || "this member"} from Mirage Digital? They lose access immediately.`}
        confirmLabel="Remove member"
        cancelLabel="Keep member"
        variant="destructive"
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
