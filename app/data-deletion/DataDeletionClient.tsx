"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { BRAND } from "@/lib/brand"

export default function DataDeletionClient() {
  const params = useSearchParams()
  const initial = params.get("code") || ""
  const [code, setCode] = useState(initial)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    let cancelled = false
    fetch(`/api/data-deletion/status?code=${encodeURIComponent(initial)}`)
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled) setStatus(json.status || "unknown")
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [initial])

  async function lookup(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch(`/api/data-deletion/status?code=${encodeURIComponent(code.trim())}`)
    const json = await response.json().catch(() => ({ status: "unavailable" }))
    setStatus(json.status || "unknown")
  }

  return (
    <main className="min-h-screen bg-[#03010A] text-white selection:bg-[#e5a93c] selection:text-black relative">
      <FrontBackground />
      <Header activeHref="/data-deletion" />
      <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative z-10 space-y-6 text-neutral-300">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">Data deletion</h1>
        <p>Last updated: September 30, 2026</p>
        <p>
          {BRAND.name} stores the Instagram, Facebook, WhatsApp, and TikTok connection you authorize, plus the conversations and contacts that connection receives. You can disconnect a channel in the dashboard. Meta can also call our deletion callback when you remove {BRAND.name} from your Facebook settings.
        </p>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Remove {BRAND.name} from Meta</h2>
          <ol className="list-decimal ps-6 space-y-2">
            <li>Open Facebook Settings, then Apps and websites.</li>
            <li>Select {BRAND.name} and choose Remove.</li>
            <li>Meta sends a signed request to <code className="text-white">/api/meta/data-deletion</code>.</li>
            <li>We revoke the stored tokens, delete conversations and contacts for that Meta user, and return a confirmation code.</li>
            <li>Your {BRAND.name} login email stays so you can still open the account and export billing records.</li>
          </ol>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Check a confirmation code</h2>
          <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="hx_…"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            />
            <button type="submit" className="rounded-xl bg-white text-black text-sm font-medium px-4 py-2">Look up</button>
          </form>
          {status && <p className="text-sm text-white">Status: {status}</p>}
        </section>
        <p>
          To delete a {BRAND.name} account that was never connected to Meta, email the address on your billing receipt and include the account email. We delete the workspace data after we confirm you own it.
        </p>
      </div>
      <Footer />
    </main>
  )
}
