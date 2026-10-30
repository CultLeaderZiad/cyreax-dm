"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"


interface Plan {
  id: string
  name: string
  description: string | null
  price_usd: number
  price_yearly: number | null
  billing_cycle: "monthly" | "yearly" | "lifetime"
  features: string[] | null
  is_active: boolean
  stripe_price_id: string | null
  is_contact_sales: boolean
  platforms: {
    instagram: boolean
    facebook: boolean
    whatsapp: boolean
    telegram: boolean
    tiktok: boolean
  }
}

interface Agent {
  id: string
  name: string
}

interface PlanAgent {
  plan_id: string
  agent_id: string
}

const EMPTY_FORM = {
  name: "",
  description: "",
  price_usd: "",
  price_yearly: "",
  billing_cycle: "monthly" as Plan["billing_cycle"],
  features: "",
  stripe_price_id: "",
  is_active: true,
  is_contact_sales: false,
  platforms: {
    instagram: true,
    facebook: true,
    whatsapp: false,
    telegram: false,
    tiktok: false,
  }
}

export default function DashboardAdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [planAgents, setPlanAgents] = useState<PlanAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      setError("")
      const [plansRes, agentsRes, planAgentsRes] = await Promise.all([
        fetch("/api/admin/plans"),
        fetch("/api/admin/agents"),
        fetch("/api/admin/plan-agents")
      ])

      if (!plansRes.ok) throw new Error("Failed to load plans")
      
      const plansData = await plansRes.json()
      setPlans(plansData)

      if (agentsRes.ok) {
        setAgents(await agentsRes.json())
      }
      
      if (planAgentsRes.ok) {
        setPlanAgents(await planAgentsRes.json())
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePlanAgent = async (planId: string, agentId: string, enable: boolean) => {
    try {
      // Optimistic
      if (enable) {
        setPlanAgents([...planAgents, { plan_id: planId, agent_id: agentId }])
      } else {
        setPlanAgents(planAgents.filter(pa => !(pa.plan_id === planId && pa.agent_id === agentId)))
      }

      const res = await fetch("/api/admin/plan-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, agent_id: agentId, enable })
      })

      if (!res.ok) throw new Error("Failed to update agent mapping")
    } catch (err) {
      fetchPlans() // revert
      toast.error("Failed to update mapping")
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      description: plan.description || "",
      price_usd: String(plan.price_usd),
      price_yearly: plan.price_yearly !== null ? String(plan.price_yearly) : "",
      billing_cycle: plan.billing_cycle,
      features: Array.isArray(plan.features) ? plan.features.join(", ") : "",
      stripe_price_id: plan.stripe_price_id || "",
      is_active: plan.is_active,
      is_contact_sales: plan.is_contact_sales,
      platforms: plan.platforms || {
        instagram: true,
        facebook: true,
        whatsapp: false,
        telegram: false,
        tiktok: false,
      }
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.price_usd) {
      toast.error("Name and price are required")
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_usd: parseFloat(form.price_usd),
        price_yearly: form.price_yearly ? parseFloat(form.price_yearly) : null,
        billing_cycle: form.billing_cycle,
        features: form.features
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        stripe_price_id: form.stripe_price_id.trim() || null,
        is_active: form.is_active,
        is_contact_sales: form.is_contact_sales,
        platforms: form.platforms,
      }

      const res = editingId
        ? await fetch(`/api/admin/plans/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save plan")
      }

      setDialogOpen(false)
      await fetchPlans()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (plan: Plan) => {
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !plan.is_active }),
      })
      if (!res.ok) throw new Error("Failed to update plan")
      await fetchPlans()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const [planToDelete, setPlanToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = (id: string) => {
    setPlanToDelete(id)
  }

  const handleConfirmDelete = async () => {
    if (!planToDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/plans/${planToDelete}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete plan")
      toast.success("Plan deleted")
      setPlanToDelete(null)
      await fetchPlans()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Plans & Billing</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Changes go live on the public pricing page immediately.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#e5a93c] text-black hover:bg-[#d4952b] font-semibold">
          <Plus className="w-4 h-4 me-1.5" /> Add Plan
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
            <Plus className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">No Custom Plans Created</h3>
          <p className="text-sm text-neutral-400 mb-6">
            Create your first subscription tier or enterprise plan to display on the public pricing page.
          </p>
          <Button onClick={openCreate} className="bg-[#e5a93c] hover:bg-[#d4952b] text-black font-semibold text-xs font-mono-ui uppercase tracking-wider cursor-pointer">
            <Plus className="w-4 h-4 me-1.5" /> Add Plan
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {plans.map((plan) => (
            <div key={plan.id} className="relative flex flex-col h-full">
              <div
                className={`border border-white/10 hover:border-white/20 bg-[#0d0e13]/90 rounded-2xl p-6 flex flex-col justify-between gap-4 h-full shadow-xl backdrop-blur-md transition-all ${
                  !plan.is_active ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                      {plan.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors text-neutral-400 hover:text-white cursor-pointer"
                      title="Edit plan"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-neutral-400 hover:text-red-400 cursor-pointer"
                      title="Delete plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-2xl text-white font-bold">${plan.price_usd}</span>
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                      /{plan.billing_cycle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold ${
                        plan.is_active ? "text-green-400" : "text-neutral-500"
                      }`}
                    >
                      {plan.is_active ? "Live" : "Hidden"}
                    </span>
                    <Switch
                      checked={plan.is_active}
                      onCheckedChange={() => handleToggleActive(plan)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-full p-8 text-center border border-dashed border-white/10 rounded-xl text-neutral-500">
              No plans found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Plan-to-Agent Matrix */}
      {!loading && plans.length > 0 && agents.length > 0 && (
        <div className="mt-12">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Plan-Agent Matrix</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Configure which AI agents are available in each plan. Changes apply immediately.
            </p>
          </div>
          <div className="bg-[#0b0b0a] border border-white/10 rounded-2xl overflow-x-auto">
            <table className="w-full text-start text-sm whitespace-nowrap">
              <thead className="bg-white/[0.02] border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500 sticky start-0 bg-[#0b0b0a] z-10 border-e border-white/10">Agent</th>
                  {plans.map(plan => (
                    <th key={plan.id} className="px-6 py-4 font-mono-ui text-[10px] uppercase tracking-widest text-neutral-500 text-center">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white sticky start-0 bg-[#0b0b0a] z-10 border-e border-white/10">
                      {agent.name}
                    </td>
                    {plans.map(plan => {
                      const isEnabled = planAgents.some(pa => pa.plan_id === plan.id && pa.agent_id === agent.id)
                      return (
                        <td key={plan.id} className="px-6 py-4 text-center">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(v) => handleTogglePlanAgent(plan.id, agent.id, v)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0B0812] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Plan" : "Add Plan"}</DialogTitle>
            <DialogDescription className="text-neutral-400">
              {editingId
                ? "Update the plan — changes apply to the public pricing page immediately."
                : "Create a new plan visible on the public pricing page."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Name</Label>
                <Input
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Pro Plan"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-neutral-300">Price (Mo)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="9.99"
                    value={form.price_usd}
                    onChange={(e) => setForm({ ...form, price_usd: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-neutral-300">Price (Yr)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="99.99"
                    value={form.price_yearly}
                    onChange={(e) => setForm({ ...form, price_yearly: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Description</Label>
              <Textarea
                className="bg-white/5 border-white/10 text-white"
                placeholder="What does this plan include?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Billing Cycle</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) =>
                    setForm({ ...form, billing_cycle: v as Plan["billing_cycle"] })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B0812] border-white/10 text-white">
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Stripe Price ID (optional)</Label>
                <Input
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="price_..."
                  value={form.stripe_price_id}
                  onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-neutral-300">Features (comma separated)</Label>
              <Textarea
                className="bg-white/5 border-white/10 text-white"
                placeholder="Unlimited automations, AI ice breakers, Priority support"
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm text-white">Active on pricing page</p>
                  <p className="text-xs text-neutral-500">Toggle to show or hide this plan publicly.</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm text-white">Contact Sales / Enterprise Plan</p>
                  <p className="text-xs text-neutral-500">Enable this if it's a custom/enterprise plan without fixed pricing.</p>
                </div>
                <Switch
                  checked={form.is_contact_sales}
                  onCheckedChange={(v) => setForm({ ...form, is_contact_sales: v })}
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-neutral-300">Supported Platforms</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(form.platforms).map((platform) => (
                  <div key={platform} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 bg-white/5">
                    <span className="text-sm text-white capitalize">{platform}</span>
                    <Switch
                      checked={form.platforms[platform as keyof typeof form.platforms]}
                      onCheckedChange={(v) => setForm({
                        ...form,
                        platforms: { ...form.platforms, [platform]: v }
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10 text-neutral-300 hover:bg-white/5">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#e5a93c] text-black hover:bg-[#d4952b] font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!planToDelete}
        onOpenChange={(open) => !open && setPlanToDelete(null)}
        title="Delete plan"
        description="Are you sure you want to delete this subscription plan? Users currently subscribed will not be affected until their billing period ends."
        confirmLabel="Delete plan"
        variant="destructive"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
