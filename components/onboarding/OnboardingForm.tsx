"use client"

import { useState } from "react"
import { HelpCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Fields = { fullName: string; company: string; instagramUsername: string; facebookId: string; telegramBotToken: string }
type Errors = Partial<Record<keyof Fields | "channels", string>>

const GUIDE = "/guides/connect"

function Help({ anchor }: { anchor: string }) {
  return (
    <a href={`${GUIDE}#${anchor}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] hover:underline">
      <HelpCircle className="size-3.5" /> How do I find it?
    </a>
  )
}

/**
 * Shown to every new customer before the dashboard. The admin connects each
 * customer's accounts by hand, so this is where the details come from. At
 * least one channel is required; the Telegram token is stored sealed.
 */
export function OnboardingForm({ initial }: { initial?: Partial<Fields> }) {
  const [values, setValues] = useState<Fields>({ fullName: "", company: "", instagramUsername: "", facebookId: "", telegramBotToken: "", ...initial })
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      const res = await fetch("/api/onboarding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        window.location.reload()
        return
      }
      setErrors(data.errors || {})
      setMessage(data.error || "Could not save. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof Fields, label: string, opts: { placeholder: string; optional?: boolean; help?: string; type?: string; hint?: string }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={key} className="text-[13px]">
          {label} {opts.optional && <span className="font-normal text-[var(--t3)]">(optional)</span>}
        </Label>
        {opts.help && <Help anchor={opts.help} />}
      </div>
      <Input id={key} type={opts.type || "text"} value={values[key]} onChange={set(key)} placeholder={opts.placeholder} autoComplete="off" aria-invalid={Boolean(errors[key])} />
      {opts.hint && !errors[key] && <p className="text-[11.5px] text-[var(--t3)]">{opts.hint}</p>}
      {errors[key] && <p className="text-[12px] text-[var(--red)]">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--t1)]">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--s1)] p-7 motion-fade-in-up">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Tell us about your accounts</h1>
          <p className="text-[13.5px] leading-relaxed text-[var(--t2)]">
            We connect your accounts for you. Send us the details below, then we will send you an invitation to accept on Instagram and Facebook. It takes about two minutes.
          </p>
        </div>

        {field("fullName", "Your name", { placeholder: "Full name" })}
        {field("company", "Company or brand", { placeholder: "Company name", optional: true })}
        {field("instagramUsername", "Instagram username", { placeholder: "mybrand", optional: true, help: "instagram", hint: "Without the @. Needs a Business or Creator account." })}
        {field("facebookId", "Facebook Page ID", { placeholder: "105298374612345", optional: true, help: "facebook", hint: "A number, not the page name." })}
        {field("telegramBotToken", "Telegram bot token", { placeholder: "123456789:ABC...", optional: true, help: "telegram", hint: "Only if you want a Telegram bot. We keep it encrypted." })}

        {errors.channels && <p className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-3 text-[12.5px] text-[var(--red)]">{errors.channels}</p>}
        {message && !errors.channels && <p role="alert" className="text-[12.5px] text-[var(--red)]">{message}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Send my details"}
        </Button>
        <p className="text-center text-[11.5px] text-[var(--t3)]">Add at least one channel. You can send the others later.</p>
      </form>
    </div>
  )
}
