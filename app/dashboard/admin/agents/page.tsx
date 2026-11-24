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

  async function fetchAgents() {
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
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-white/20" />
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-700">
      <div className="mb-8 flex justify-between items-start sm:items-center">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--t1)] mb-2">Agents Catalog</h1>
          <p className="text-[var(--t2)] text-sm">
            Manage AI features available across the platform. Disabling an agent here instantly turns it off for everyone.
          </p>
        </div>
        <Button onClick={fetchAgents} variant="outline" size="sm" className="border-[var(--line)] text-xs font-semibold">
          <RefreshCw className="w-3.5 h-3.5 me-1.5" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[#0a0a0a] p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-[var(--s2)] rounded-2xl flex items-center justify-center border border-[var(--line)]">
            <Bot className="w-7 h-7 text-[var(--t2)]" />
          </div>
          <h3 className="text-base font-bold text-[var(--t1)] mb-1">No Agents in Catalog</h3>
          <p className="text-sm text-[var(--t2)] mb-6">
            There are currently no AI agents registered in the database catalog. Run the database migration script <code>32-schema-agents-system.sql</code> to register default agent models.
          </p>
          <Button onClick={fetchAgents} className="bg-white hover:bg-neutral-200 text-black font-semibold text-xs">
            <RefreshCw className="w-3.5 h-3.5 me-1.5" /> Check Again
          </Button>
        </div>
      ) : (
        <div className="bg-[var(--s1)] border border-[var(--line)] rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm whitespace-nowrap">
              <thead className="bg-[var(--s2)] border-b border-[var(--line)]">
                <tr>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)]">Name & Key</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)]">Category</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)]">Provider</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)]">BYOK</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)] text-center">Active</th>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-[var(--t3)] text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-[var(--s3)] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[var(--t1)] text-sm">{agent.name}</div>
                      <div className="text-[10px] font-mono text-[var(--t3)] mt-0.5">{agent.agent_key}</div>
                    </td>
                    <td className="px-6 py-4 text-[var(--t2)] capitalize text-xs">{agent.category || "Uncategorized"}</td>
                    <td className="px-6 py-4 text-[var(--t2)] font-mono text-xs">{agent.provider}</td>
                    <td className="px-6 py-4">
                      {agent.requires_byok ? (
                        <span className="bg-[#e5a93c]/10 text-[var(--gold)] border border-[#e5a93c]/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Required</span>
                      ) : (
                        <span className="text-[var(--t3)] text-xs">Included</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Switch 
                        checked={agent.is_active} 
                        onCheckedChange={() => handleToggleActive(agent.id, agent.is_active)}
                      />
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(agent)} className="text-xs hover:bg-[var(--s3)]">
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
        <DialogContent className="bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle>Edit Agent Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="bg-black border-[var(--line)]"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="bg-black border-[var(--line)]"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="bg-black border-[var(--line)] min-h-[100px]"
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
