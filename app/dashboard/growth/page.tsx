"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { COMMENT_TO_DM_TEMPLATES } from "@/lib/growth/tools"
import { Loader2 } from "lucide-react"

export default function GrowthPage() {
  const { userId, isLoading } = useInstagramSession()
  const { data, mutate, isLoading: loading } = useSWR(userId ? "/api/growth" : null, fetcher)
  const [mediaId, setMediaId] = useState("")
  const [bioTitle, setBioTitle] = useState("")
  const [refForm, setRefForm] = useState({ channel: "instagram", handle: "", code: "PRICE" })
  const [giveaway, setGiveaway] = useState({ name: "Reel giveaway", keyword: "WIN", winnerCount: "1" })
  const [svg, setSvg] = useState("")
  const [notice, setNotice] = useState("")

  async function setupTemplate(templateId: string) {
    const res = await fetch("/api/growth/comment-to-dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, mediaId: mediaId || null }),
    })
    const body = await res.json()
    setNotice(body.flowId ? "Flow is live for that Reel." : body.migration_required ? "Automation saved. Run the phase 5 migration to attach the flow." : body.error || "Saved")
    mutate()
  }

  async function saveBio() {
    const res = await fetch("/api/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bio", title: bioTitle }),
    })
    const body = await res.json()
    setNotice(body.bio ? `Page is /b/${body.bio.slug}` : body.error || "Could not save")
    mutate()
  }

  async function saveRef() {
    const res = await fetch("/api/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "ref", ...refForm }),
    })
    const body = await res.json()
    if (body.svg) setSvg(body.svg)
    setNotice(body.ref?.url || body.error || "")
    mutate()
  }

  async function saveGiveaway() {
    const res = await fetch("/api/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "giveaway", ...giveaway, winnerCount: Number(giveaway.winnerCount) }),
    })
    const body = await res.json()
    setNotice(body.giveaway ? "Giveaway is open. Comments with the keyword are entries." : body.error || "")
    mutate()
  }

  async function draw(id: string) {
    const res = await fetch("/api/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "draw", giveawayId: id }),
    })
    const body = await res.json()
    setNotice(body.winners ? `Winners: ${body.winners.join(", ") || "none"}` : body.error || "")
    mutate()
  }

  if (isLoading || loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Growth</h1>
        <p className="text-sm text-neutral-400 mt-1">Comment-to-DM for a Reel, a link-in-bio page, ref links with a QR code, and a keyword giveaway.</p>
      </div>
      {notice && <p className="text-sm text-amber-100">{notice}</p>}
      {data?.migration_required && <p className="text-sm text-amber-200">Run the phase 5 SQL migration to store pages, refs, and giveaways.</p>}

      <section className="space-y-3">
        <h2 className="text-white">Comment to DM</h2>
        <input value={mediaId} onChange={(event) => setMediaId(event.target.value)} placeholder="Reel id" className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white w-full max-w-md" />
        <div className="grid md:grid-cols-3 gap-3">
          {COMMENT_TO_DM_TEMPLATES.map((template) => (
            <button key={template.id} onClick={() => setupTemplate(template.id)} className="text-start rounded-xl border border-white/10 p-4 hover:bg-white/[0.04]">
              <div className="text-white text-sm font-medium">{template.name}</div>
              <div className="text-xs text-neutral-500 mt-1">Keyword {template.keyword}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-white">Link in bio</h2>
        {data?.bio && <a className="text-sm text-[#e5a93c]" href={`/b/${data.bio.slug}`}>/b/{data.bio.slug}</a>}
        <div className="flex gap-2">
          <input value={bioTitle} onChange={(event) => setBioTitle(event.target.value)} placeholder="Page title" className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
          <button onClick={saveBio} className="h-9 px-3 rounded-lg bg-[#e5a93c] text-black text-sm">Create page</button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-white">Ref link and QR</h2>
        <div className="flex flex-wrap gap-2">
          <select className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" value={refForm.channel} onChange={(event) => setRefForm({ ...refForm, channel: event.target.value })}>
            <option value="instagram">ig.me</option>
            <option value="messenger">m.me</option>
            <option value="whatsapp">wa.me</option>
            <option value="telegram">t.me</option>
            <option value="tiktok">tiktok.me</option>
          </select>
          <input className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" placeholder="username or phone" value={refForm.handle} onChange={(event) => setRefForm({ ...refForm, handle: event.target.value })} />
          <input className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" placeholder="CODE" value={refForm.code} onChange={(event) => setRefForm({ ...refForm, code: event.target.value })} />
          <button onClick={saveRef} className="h-9 px-3 rounded-lg bg-[#e5a93c] text-black text-sm">Create</button>
        </div>
        {svg && <div className="bg-white rounded-xl p-3 w-fit" dangerouslySetInnerHTML={{ __html: svg }} />}
        <ul className="text-sm text-neutral-400 space-y-1">
          {(data?.refs || []).map((ref: { id: string; url: string; channel: string }) => (
            <li key={ref.id}>{ref.channel}: {ref.url}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-white">Giveaway</h2>
        <div className="flex flex-wrap gap-2">
          <input className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" value={giveaway.name} onChange={(event) => setGiveaway({ ...giveaway, name: event.target.value })} />
          <input className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" value={giveaway.keyword} onChange={(event) => setGiveaway({ ...giveaway, keyword: event.target.value })} />
          <input className="h-9 w-20 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white" value={giveaway.winnerCount} onChange={(event) => setGiveaway({ ...giveaway, winnerCount: event.target.value })} />
          <button onClick={saveGiveaway} className="h-9 px-3 rounded-lg bg-[#e5a93c] text-black text-sm">Open</button>
        </div>
        <ul className="space-y-2">
          {(data?.giveaways || []).map((row: { id: string; name: string; keyword: string; status: string; winners?: string[] }) => (
            <li key={row.id} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm">
              <span className="text-neutral-200">{row.name} · {row.keyword} · {row.status} {row.winners?.length ? `· ${row.winners.join(", ")}` : ""}</span>
              {row.status === "open" && <button onClick={() => draw(row.id)} className="text-[#e5a93c]">Pick winners</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
