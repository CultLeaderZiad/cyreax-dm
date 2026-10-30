"use client"

import { useState, useEffect } from "react"
import { Users, Mail, Loader2, Trash2, Plus, AlertCircle, Shield } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function TeamPanel() {
  const [members, setMembers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(0)
  const [userRole, setUserRole] = useState("admin")
  const [myEmail, setMyEmail] = useState<string | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("client-viewer")
  const [inviting, setInviting] = useState(false)

  const fetchTeam = async () => {
    try {
      const res = await fetch("/api/team")
      const data = await res.json()
      if (res.ok) {
        setMembers(data.members || [])
        setLimit(data.limit || 0)
      } else {
        toast.error(data.error || "Failed to load team")
      }
      
      const authRes = await fetch("/api/auth/me")
      const authData = await authRes.json()
      if (authRes.ok) {
        setUserRole(authData.permission_level || "admin")
        setMyEmail(authData.email || null)
      }

      const inviteRes = await fetch("/api/team/invites")
      const inviteData = await inviteRes.json()
      if (inviteRes.ok) setInvites(inviteData.invites || [])
    } catch (e) {
      toast.error("Error connecting to server")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeam()
  }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return
    setInviting(true)

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, permission_level: inviteRole })
      })
      const data = await res.json()
      
      if (res.ok) {
        toast.success(`Invited ${inviteEmail}. They need to accept before they can access this account.`)
        setInviteEmail("")
        fetchTeam()
      } else {
        toast.error(data.error || "Failed to invite member")
      }
    } catch (e) {
      toast.error("Error sending invite")
    } finally {
      setInviting(false)
    }
  }

  const handleAccept = async (id: string) => {
    setAcceptingId(id)
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Invite accepted. Reload to view that agency.")
        fetchTeam()
      } else {
        toast.error(data.error || "Failed to accept invite")
      }
    } catch {
      toast.error("Error accepting invite")
    } finally {
      setAcceptingId(null)
    }
  }

  const handleRemove = (id: string) => {
    setMemberToRemove(id)
  }

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/team?id=${memberToRemove}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Member removed")
        setMemberToRemove(null)
        fetchTeam()
      } else {
        toast.error("Failed to remove member")
      }
    } catch (e) {
      toast.error("Error removing member")
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
  }

  return (
    <div className="p-6 rounded-2xl border border-white/[0.08] bg-[#0b0b10] hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#e5a93c]/10 border border-[#e5a93c]/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-[#e5a93c]" />
          </div>
          <div>
            <h3 className="text-white font-medium">Agency Team</h3>
            <p className="text-xs text-muted-foreground">Manage your team members ({members.length}/{limit} seats used). Invites stay pending until accepted.</p>
          </div>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-400">Invitations for you</p>
          {invites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between p-3 rounded-xl bg-[#e5a93c]/5 border border-[#e5a93c]/20">
              <div>
                <p className="text-sm text-white font-medium">Agency seat</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider mt-1">{invite.permission_level} · pending</p>
              </div>
              <button
                onClick={() => handleAccept(invite.id)}
                disabled={acceptingId === invite.id}
                className="bg-[#e5a93c] hover:bg-[#d4952b] disabled:opacity-50 text-black font-semibold px-3 py-1.5 rounded-lg text-xs"
              >
                {acceptingId === invite.id ? "Accepting..." : "Accept"}
              </button>
            </div>
          ))}
        </div>
      )}

      {userRole === "admin" && (
        <form onSubmit={handleInvite} className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Mail className="w-4 h-4 text-neutral-500 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              placeholder="colleague@agency.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 ps-9 pe-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#e5a93c]/50"
              required
            />
          </div>
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 text-sm text-white focus:outline-none [&>option]:bg-[#0b0b10] [&>option]:text-white"
          >
            <option value="client-viewer">Client viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting || members.length >= limit}
            className="bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Invite
          </button>
        </form>
      )}

      {userRole === "admin" && members.length >= limit && (
        <div className="mb-4 flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>You have reached your team seat limit. Upgrade your plan to add more members.</p>
        </div>
      )}

      <div className="space-y-2">
        {members.length === 0 ? (
          <div className="text-center py-6 text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl">
            No team members yet. Invite someone above.
          </div>
        ) : (
          members.map(member => (
            <div key={member.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
              <div>
                <p className="text-sm text-white font-medium">{member.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${member.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {member.status === 'active' ? 'active' : 'pending'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-neutral-400 uppercase tracking-wider">
                    <Shield className="w-3 h-3" />
                    {member.permission_level}
                  </span>
                </div>
              </div>
              {member.status === 'invited' && myEmail && member.email?.toLowerCase() === myEmail.toLowerCase() ? (
                <button
                  onClick={() => handleAccept(member.id)}
                  disabled={acceptingId === member.id}
                  className="bg-[#e5a93c] hover:bg-[#d4952b] disabled:opacity-50 text-black font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  {acceptingId === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept invite"}
                </button>
              ) : userRole === "admin" ? (
                <button
                  onClick={() => handleRemove(member.id)}
                  className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title="Remove member"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title="Remove team member"
        description="Are you sure you want to remove this team member? They will lose access to this workspace immediately."
        confirmLabel="Remove member"
        variant="destructive"
        loading={removing}
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
