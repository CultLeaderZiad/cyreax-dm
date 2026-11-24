"use client"

import React, { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { COMMENT_TO_DM_TEMPLATES } from "@/lib/growth/tools"
import { Loader2 } from "lucide-react"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-[160px] flex-1 space-y-1.5">
      <span className="text-[11.5px] font-medium text-[var(--t3)]">{label}</span>
      {children}
    </label>
  )
}

export default function GrowthPage() {
  const { userId, isLoading } = useInstagramSession()
  const { data, mutate, isLoading: loading } = useSWR(userId ? "/api/growth" : null, fetcher)
  const [mediaId, setMediaId] = useState("")
  const [bioTitle, setBioTitle] = useState("")
  const [refForm, setRefForm] = useState({ channel: "instagram", handle: "", code: "" })
  const [giveaway, setGiveaway] = useState({ name: "", keyword: "", winnerCount: "1" })
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

  if (isLoading || loading) return <div className="flex justify-center py-24"><Loader2 className="size-6 animate-spin text-[var(--t3)]" /></div>

  const input = "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--s2)] px-3 text-[13px] text-[var(--t1)] outline-none transition-colors placeholder:text-[var(--t4)] focus:border-[var(--gold)]"
  const primary = "h-10 shrink-0 cursor-pointer rounded-lg bg-[var(--gold)] px-4 text-[13px] font-semibold text-black transition-colors hover:bg-[var(--gold2)] disabled:opacity-50"
  const card = "space-y-4 rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 transition-colors hover:border-[var(--line2)]"

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-7 motion-fade-in">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--t1)]">Growth</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--t2)]">Comment-to-DM for a Reel, a link-in-bio page, ref links with a QR code, and a keyword giveaway.</p>
      </div>
      {notice && <p role="status" className="rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-2.5 text-[13px] text-[var(--t1)]">{notice}</p>}
      {data?.migration_required && <p className="rounded-lg border border-[var(--line)] bg-[var(--s1)] px-4 py-2.5 text-[13px] text-[var(--t2)]">Run the phase 5 SQL migration to store pages, refs, and giveaways.</p>}

      <section className={card}>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--t1)]">Comment to DM</h2>
          <p className="text-[12.5px] text-[var(--t3)]">Pick a keyword and we reply to every comment with a DM. Add the Reel id to limit it to one Reel.</p>
        </div>
        <Field label="Reel id (optional)">
          <input value={mediaId} onChange={(event) => setMediaId(event.target.value)} placeholder="Reel id" className={`${input} max-w-md`} />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          {COMMENT_TO_DM_TEMPLATES.map((template) => (
            <button key={template.id} onClick={() => setupTemplate(template.id)} className="cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--s2)] p-4 text-start transition-all hover:-translate-y-0.5 hover:border-[var(--gold)]/50">
              <div className="text-[13.5px] font-medium text-[var(--t1)]">{template.name}</div>
              <div className="mt-1 text-[12px] text-[var(--t3)]">Keyword {template.keyword}</div>
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--t1)]">Link in bio</h2>
          <p className="text-[12.5px] text-[var(--t3)]">A single page you put in your bio.</p>
        </div>
        {data?.bio && <a className="inline-block text-[13px] font-medium text-[var(--gold)] hover:underline" href={`/b/${data.bio.slug}`}>/b/{data.bio.slug}</a>}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Page title">
            <input value={bioTitle} onChange={(event) => setBioTitle(event.target.value)} placeholder="Page title" className={input} />
          </Field>
          <button onClick={saveBio} disabled={!bioTitle.trim()} className={primary}>Create page</button>
        </div>
      </section>

      <section className={card}>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--t1)]">Ref link and QR</h2>
          <p className="text-[12.5px] text-[var(--t3)]">A link that opens a chat with a code, plus a QR code you can print.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Channel">
            <select className={input} value={refForm.channel} onChange={(event) => setRefForm({ ...refForm, channel: event.target.value })}>
              <option value="instagram">ig.me</option>
              <option value="messenger">m.me</option>
              <option value="whatsapp">wa.me</option>
              <option value="telegram">t.me</option>
              <option value="tiktok">tiktok.me</option>
            </select>
          </Field>
          <Field label="Username or phone">
            <input className={input} placeholder="username or phone" value={refForm.handle} onChange={(event) => setRefForm({ ...refForm, handle: event.target.value })} />
          </Field>
          <Field label="Code">
            <input className={input} placeholder="CODE" value={refForm.code} onChange={(event) => setRefForm({ ...refForm, code: event.target.value })} />
          </Field>
          <button onClick={saveRef} disabled={!refForm.handle.trim()} className={primary}>Create</button>
        </div>
        {svg && <div className="w-fit rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: svg }} />}
        {(data?.refs || []).length > 0 && (
          <ul className="space-y-1 text-[13px] text-[var(--t2)]">
            {(data?.refs || []).map((ref: { id: string; url: string; channel: string }) => (
              <li key={ref.id} className="truncate font-mono text-[12px]" dir="ltr">{ref.channel}: {ref.url}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--t1)]">Giveaway</h2>
          <p className="text-[12.5px] text-[var(--t3)]">Comments with the keyword are entries. Pick the winners when it ends.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input className={input} placeholder="Giveaway name" value={giveaway.name} onChange={(event) => setGiveaway({ ...giveaway, name: event.target.value })} />
          </Field>
          <Field label="Keyword">
            <input className={input} placeholder="KEYWORD" value={giveaway.keyword} onChange={(event) => setGiveaway({ ...giveaway, keyword: event.target.value })} />
          </Field>
          <label className="block w-24 space-y-1.5">
            <span className="text-[11.5px] font-medium text-[var(--t3)]">Winners</span>
            <input className={input} inputMode="numeric" value={giveaway.winnerCount} onChange={(event) => setGiveaway({ ...giveaway, winnerCount: event.target.value })} />
          </label>
          <button onClick={saveGiveaway} disabled={!giveaway.name.trim() || !giveaway.keyword.trim()} className={primary}>Open</button>
        </div>
        {(data?.giveaways || []).length > 0 && (
          <ul className="space-y-2">
            {(data?.giveaways || []).map((row: { id: string; name: string; keyword: string; status: string; winners?: string[] }) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--s2)] px-4 py-3 text-[13px]">
                <span className="text-[var(--t1)]">{row.name} · {row.keyword} · {row.status} {row.winners?.length ? `· ${row.winners.join(", ")}` : ""}</span>
                {row.status === "open" && <button onClick={() => draw(row.id)} className="cursor-pointer font-medium text-[var(--gold)] hover:underline">Pick winners</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
