"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { BRAND } from "@/lib/brand"

export default function AgencyPage() {
  const agency = useSWR("/api/agency", fetcher)
  const overview = useSWR("/api/agency/overview", fetcher)
  const reports = useSWR("/api/agency/reports", fetcher)
  const current = agency.data?.agency
  const [name, setName] = useState("")
  const [appName, setAppName] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [primary, setPrimary] = useState("#5b4dff")
  const [accent, setAccent] = useState("#e5a93c")
  const [domain, setDomain] = useState("")
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const prices = useSWR("/api/agency/pricing", fetcher)
  const [priceWorkspace, setPriceWorkspace] = useState("")
  const [amountCents, setAmountCents] = useState("4900")
  const [currency, setCurrency] = useState("sar")
  const [priceInterval, setPriceInterval] = useState("month")
  const [provider, setProvider] = useState("tap")

  async function save() {
    const response = await fetch("/api/agency", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || current?.name,
        appName: appName || current?.app_name,
        logoUrl: logoUrl || current?.logo_url,
        primaryColor: primary,
        accentColor: accent,
        customDomain: domain || current?.custom_domain,
      }),
    })
    const json = await response.json()
    setNote(response.ok ? "Branding saved" : json.error || "Save failed")
    agency.mutate()
  }

  async function savePrice() {
    const response = await fetch("/api/agency/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: priceWorkspace,
        amountCents: Number(amountCents),
        currency,
        interval: priceInterval,
        provider,
      }),
    })
    const json = await response.json()
    setNote(response.ok ? "Client price saved" : json.error || "Could not save the price")
    if (response.ok) prices.mutate()
  }

  async function createInvoice() {
    const response = await fetch("/api/agency/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: priceWorkspace }),
    })
    const json = await response.json()
    setNote(response.ok ? json.url || "Invoice created" : json.error || "Could not create the invoice")
  }

  async function schedule(cadence: "weekly" | "monthly", format: "pdf" | "link") {
    const response = await fetch("/api/agency/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, cadence, format }),
    })
    const json = await response.json()
    setNote(response.ok ? "Report scheduled" : json.error || "Could not schedule")
    if (response.ok) reports.mutate()
  }

  const totals = overview.data?.totals

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Agency</h1>
        <p className="text-sm text-neutral-400 mt-1">White-label name, colors, and a custom domain. Clients open the branded portal.</p>
      </div>
      {agency.data?.migration_required && <p className="text-sm text-amber-200/90">Run the phase 6 SQL migration before branding can be stored.</p>}
      {note && <p className="text-sm text-neutral-300">{note}</p>}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="Conversations" value={totals?.conversations || 0} />
        <Stat label="Contacts" value={totals?.newContacts || 0} />
        <Stat label="Orders" value={totals?.orders || 0} />
        <Stat label="Revenue (cents)" value={totals?.revenueCents || 0} />
      </section>
      <div className="overflow-x-auto border border-white/10 rounded-2xl">
        <table className="w-full text-sm text-start">
          <thead className="text-neutral-500 text-xs uppercase"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Contacts</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">AI replies</th></tr></thead>
          <tbody>
            {(overview.data?.clients || []).map((client: { workspaceId: string; name: string; kpis: { newContacts: number; orders: number; aiReplies: number } }) => (
              <tr key={client.workspaceId} className="border-t border-white/5 text-neutral-200">
                <td className="px-4 py-3 text-white">{client.name}</td>
                <td className="px-4 py-3">{client.kpis.newContacts}</td>
                <td className="px-4 py-3">{client.kpis.orders}</td>
                <td className="px-4 py-3">{client.kpis.aiReplies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="border border-white/10 rounded-2xl p-4 space-y-2">
        <h2 className="text-sm text-white">Branding</h2>
        <input className={field} placeholder={current?.name || "Agency name"} value={name} onChange={(event) => setName(event.target.value)} />
        <input className={field} placeholder={current?.app_name || "App name"} value={appName} onChange={(event) => setAppName(event.target.value)} />
        <input className={field} placeholder="https:// logo" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} />
        <div className="flex gap-2">
          <input className={field} value={primary} onChange={(event) => setPrimary(event.target.value)} />
          <input className={field} value={accent} onChange={(event) => setAccent(event.target.value)} />
        </div>
        <input className={field} placeholder="clients.example.com" value={domain} onChange={(event) => setDomain(event.target.value)} />
        <p className="text-xs text-neutral-500">Add the domain in Vercel, then point DNS at it. {BRAND.name} matches the Host header to this agency. Steps are in docs/phase6-differentiators.md.</p>
        <button type="button" className={button} onClick={save}>Save branding</button>
        <a href="/portal" className="block text-sm text-neutral-300 underline">Open the client portal</a>
      </section>
      <section className="border border-white/10 rounded-2xl p-4 space-y-2">
        <h2 className="text-sm text-white">Client price</h2>
        <p className="text-xs text-neutral-500">Set what this client pays you. Checkout uses the Paymob, Stripe, or Tap credentials saved on the workspace.</p>
        <select className={field} value={priceWorkspace} onChange={(event) => setPriceWorkspace(event.target.value)}>
          <option value="">Choose a client workspace</option>
          {(overview.data?.clients || []).map((client: { workspaceId: string; name: string }) => (
            <option key={client.workspaceId} value={client.workspaceId}>{client.name}</option>
          ))}
        </select>
        <div className="grid sm:grid-cols-4 gap-2">
          <input className={field} inputMode="numeric" value={amountCents} onChange={(event) => setAmountCents(event.target.value)} placeholder="Minor units" />
          <select className={field} value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {["usd", "egp", "sar", "aed", "qar", "kwd", "bhd", "omr"].map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}
          </select>
          <select className={field} value={priceInterval} onChange={(event) => setPriceInterval(event.target.value)}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
          <select className={field} value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="tap">Tap</option>
            <option value="stripe">Stripe</option>
            <option value="paymob">Paymob</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={savePrice}>Save price</button>
          <button type="button" className={ghost} onClick={createInvoice}>Create invoice</button>
        </div>
        {(prices.data?.prices || []).map((price: { workspace_id: string; amount_cents: number; currency: string; interval: string; provider: string }) => (
          <p key={price.workspace_id} className="text-xs text-neutral-400">{price.workspace_id.slice(0, 8)} · {price.amount_cents} {price.currency} / {price.interval} via {price.provider}</p>
        ))}
      </section>
      <section className="border border-white/10 rounded-2xl p-4 space-y-2">
        <h2 className="text-sm text-white">Scheduled report</h2>
        <input className={field} placeholder="client@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ghost} onClick={() => schedule("weekly", "link")}>Weekly link</button>
          <button type="button" className={ghost} onClick={() => schedule("monthly", "pdf")}>Monthly PDF</button>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/10 rounded-2xl p-4">
      <div className="text-xl text-white tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  )
}

const field = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
const button = "text-sm px-3 py-2 rounded-lg bg-white text-black font-medium"
const ghost = "text-sm px-3 py-2 rounded-lg border border-white/10 text-neutral-200"
