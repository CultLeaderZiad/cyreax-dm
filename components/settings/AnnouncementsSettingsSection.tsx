"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface State {
  isActive: boolean
  message: string
  link: string
  showUpdates: boolean
  content: string
  type: string
}

/**
 * Admin: what the public sees. The top bar and the "Latest Updates" block on
 * the home page are separate switches, so either can be off. The server checks
 * the admin role on save.
 */
export function AnnouncementsSettingsSection() {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings/banner", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setState({ isActive: Boolean(d.isActive), message: d.message || "", link: d.link || "", showUpdates: d.showUpdates === true, content: d.content || "", type: d.type || "standard" }))
      .catch(() => setState({ isActive: false, message: "", link: "", showUpdates: false, content: "", type: "standard" }))
  }, [])

  async function save() {
    if (!state) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings/banner", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
      if (res.ok) toast.success("Saved. Visitors see the change within a minute.")
      else toast.error((await res.json().catch(() => ({}))).error || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  if (!state) return <div className="h-40 animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--s1)]" />

  return (
    <div className="max-w-3xl space-y-6 text-[var(--t1)]">
      <div>
        <h2 className="text-[18px] font-semibold">Announcements</h2>
        <p className="mt-1 text-[13px] text-[var(--t3)]">Choose what visitors see on the public pages. Each one has its own switch.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-medium">Top bar</h3>
            <p className="text-[12px] text-[var(--t3)]">A one-line message above every public page.</p>
          </div>
          <Switch checked={state.isActive} onCheckedChange={(v) => setState({ ...state, isActive: v })} aria-label="Show the top bar" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bar-message">Message</Label>
          <Input id="bar-message" value={state.message} maxLength={300} onChange={(e) => setState({ ...state, message: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bar-link">Link (optional)</Label>
          <Input id="bar-link" value={state.link} maxLength={300} placeholder="/pricing" onChange={(e) => setState({ ...state, link: e.target.value })} />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-medium">Latest updates on the home page</h3>
            <p className="text-[12px] text-[var(--t3)]">The &quot;Latest Updates&quot; block under the features. Off by default.</p>
          </div>
          <Switch checked={state.showUpdates} onCheckedChange={(v) => setState({ ...state, showUpdates: v })} aria-label="Show the latest updates block" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="updates-content">Content (Markdown)</Label>
          <Textarea id="updates-content" rows={8} value={state.content} onChange={(e) => setState({ ...state, content: e.target.value })} placeholder={"# What is new\n\n- Item one"} />
        </div>
      </section>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
    </div>
  )
}
