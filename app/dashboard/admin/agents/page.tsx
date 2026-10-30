"use client"

import { useState, useEffect } from "react"
import { Loader2, Pencil, Bot, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

interface Agent {
  id: string
  agent_key: string
  name: string
  description: string
  provider: string
  category: string | null
  requires_byok: boolean
  is_active: boolean
  sort_order: number
}

export default function DashboardAdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
  })

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    try {
      setError("")
      const res = await fetch("/api/admin/agents")
      if (!res.ok) throw new Error("Failed to load agents")
      const data = await res.json()
      setAgents(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setAgents(agents.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a))
      
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentStatus }),
      })
      if (!res.ok) throw new Error("Failed to update status")
    } catch (err) {
      fetchAgents()
      toast.error("Failed to update status")
    }
  }

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setForm({
      name: agent.name,
      description: agent.description || "",
      category: agent.category || "",
    })
    setDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingAgent) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAgent.id,
          name: form.name,
          description: form.description,
          category: form.category,
        }),
      })

      if (!res.ok) throw new Error("Failed to update agent")
      
      setDialogOpen(false)
      fetchAgents()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/20" />
      </div>
    )
  }

  return (
    <div className="p-8 animate-in fade-in duration-700 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Agents Catalog</h1>
          <p className="text-neutral-400 text-sm">
            Manage AI features available across the platform. Disabling an agent here instantly turns it off for everyone.
          </p>
        </div>
        <Button onClick={fetchAgents} variant="outline" size="sm" className="border-white/10 text-xs font-semibold">
          <RefreshCw className="w-3.5 h-3.5 me-1.5" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
            <Bot className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">No Agents in Catalog</h3>
          <p className="text-sm text-neutral-400 mb-6">
            There are currently no AI agents registered in the database catalog. Run the database migration script <code>32-schema-agents-system.sql</code> to register default agent models.
          </p>
          <Button onClick={fetchAgents} className="bg-white hover:bg-neutral-200 text-black font-semibold text-xs">
            <RefreshCw className="w-3.5 h-3.5 me-1.5" /> Check Again
          </Button>
        </div>
      ) : (
        <div className="bg-[#0b0b0a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500">Name & Key</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500">Category</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500">Provider</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500">BYOK</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500 text-center">Active</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white text-sm">{agent.name}</div>
                      <div className="text-[10px] font-mono text-neutral-500 mt-0.5">{agent.agent_key}</div>
                    </td>
                    <td className="px-6 py-4 text-neutral-300 capitalize text-xs">{agent.category || "Uncategorized"}</td>
                    <td className="px-6 py-4 text-neutral-400 font-mono text-xs">{agent.provider}</td>
                    <td className="px-6 py-4">
                      {agent.requires_byok ? (
                        <span className="bg-[#e5a93c]/10 text-[#e5a93c] border border-[#e5a93c]/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Required</span>
                      ) : (
                        <span className="text-neutral-500 text-xs">Included</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Switch 
                        checked={agent.is_active} 
                        onCheckedChange={() => handleToggleActive(agent.id, agent.is_active)}
                      />
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(agent)} className="text-xs hover:bg-white/10">
                        <Pencil className="w-3.5 h-3.5 me-1.5" />
                        Edit Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0b0b0a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Edit Agent Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="bg-black border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="bg-black border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="bg-black border-white/10 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="bg-white hover:bg-neutral-200 text-black font-semibold">
              {saving ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
