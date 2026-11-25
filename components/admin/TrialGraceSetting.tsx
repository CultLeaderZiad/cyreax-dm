"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** How long a finished free trial keeps working (with a countdown) before access pauses. */
export function TrialGraceSetting() {
  const [hours, setHours] = useState("")
  const [max, setMax] = useState(168)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings/trial-grace")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setHours(String(d.hours))
        setMax(d.max)
      })
      .catch(() => {})
  }, [])

  async function save() {
    const value = Number(hours)
    if (!Number.isInteger(value) || value < 0 || value > max) {
      toast.error(`Enter a whole number from 0 to ${max}.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings/trial-grace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: value }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not save")
      toast.success("Grace period saved")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-4">
      <div className="space-y-1.5">
        <Label htmlFor="trial-grace" className="text-[13px]">Grace period after a free trial (hours)</Label>
        <Input id="trial-grace" type="number" min={0} max={max} step={1} value={hours} onChange={(e) => setHours(e.target.value)} className="w-32" />
      </div>
      <Button onClick={save} disabled={saving || hours === ""} variant="secondary">
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
      <p className="basis-full text-[12px] text-[var(--t3)]">After the trial ends the account keeps working for this long, with a countdown, then pauses until a plan is paid. 0 pauses it right away.</p>
    </div>
  )
}
