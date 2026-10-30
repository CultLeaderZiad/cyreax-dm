"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

export default function AiAgentPage() {
  const settings = useSWR("/api/ai-agent/settings", fetcher)
  const sources = useSWR("/api/ai-agent/knowledge", fetcher)
  const logs = useSWR("/api/ai-agent/logs", fetcher)
  const [personaName, setPersonaName] = useState("")
  const [persona, setPersona] = useState("")
  const [tone, setTone] = useState("friendly")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [kind, setKind] = useState("faq")
  const [url, setUrl] = useState("")
  const [message, setMessage] = useState("")
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [note, setNote] = useState("")
  const loaded = settings.data?.settings

  async function saveSettings() {
    setNote("")
    const response = await fetch("/api/ai-agent/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personaName: personaName || loaded?.personaName,
        persona: persona || loaded?.persona,
        tone: tone || loaded?.tone,
        handoffBelow: loaded?.handoffBelow ?? 0.45,
        stayOnTopic: true,
        qualifyFields: loaded?.qualifyFields || ["name", "phone", "email"],
      }),
    })
    const json = await response.json()
    setNote(response.ok ? "Saved" : json.error || "Save failed")
    settings.mutate()
  }

  async function addSource() {
    const response = await fetch("/api/ai-agent/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, body }),
    })
    const json = await response.json()
    setNote(response.ok ? `Stored ${json.chunks} chunks` : json.error || "Could not store")
    if (response.ok) {
      setTitle("")
      setBody("")
      sources.mutate()
    }
  }

  async function importUrl() {
    const response = await fetch("/api/ai-agent/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    const json = await response.json()
    setNote(response.ok ? "Page imported" : json.error || "Import failed")
    if (response.ok) sources.mutate()
  }

  async function upload(file: File) {
    const form = new FormData()
    form.set("file", file)
    const response = await fetch("/api/ai-agent/knowledge", { method: "POST", body: form })
    const json = await response.json()
    setNote(response.ok ? "Document stored" : json.error || "Upload failed")
    if (response.ok) sources.mutate()
  }

  async function sendPlayground() {
    const text = message.trim()
    if (!text) return
    const history = chat
    setChat((current) => [...current, { role: "user", content: text }])
    setMessage("")
    const response = await fetch("/api/ai-agent/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    })
    const json = await response.json()
    const reply = response.ok ? json.reply : json.error || "The agent could not answer"
    setChat((current) => [...current, { role: "assistant", content: reply }])
    logs.mutate()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Arabic agent</h1>
        <p className="text-sm text-neutral-400 mt-1">Answers in the customer&apos;s dialect, from this workspace&apos;s knowledge base.</p>
      </div>
      {settings.data?.migration_required && <p className="text-sm text-amber-200/90">Run the phase 6 SQL migration before the agent can store a knowledge base.</p>}
      {note && <p className="text-sm text-neutral-300">{note}</p>}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="border border-white/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-white">Persona</h2>
          <input className={field} placeholder={loaded?.personaName || "Assistant name"} value={personaName} onChange={(event) => setPersonaName(event.target.value)} />
          <textarea className={field} rows={4} placeholder={loaded?.persona || "Who the assistant is and what the business sells"} value={persona} onChange={(event) => setPersona(event.target.value)} />
          <select className={field} value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="concise">Concise</option>
          </select>
          <button type="button" onClick={saveSettings} className={button}>Save</button>
        </div>
        <div className="border border-white/10 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-medium text-white">Knowledge</h2>
          <select className={field} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="faq">FAQ</option>
            <option value="product">Product</option>
            <option value="policy">Policy</option>
          </select>
          <input className={field} placeholder="Title or question" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className={field} rows={3} placeholder="Answer, price, or policy" value={body} onChange={(event) => setBody(event.target.value)} />
          <button type="button" onClick={addSource} className={button}>Add</button>
          <input className={field} placeholder="https://example.com/faq" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="button" onClick={importUrl} className={button}>Import URL</button>
          <input type="file" accept=".txt,.md,.csv,.pdf" className="text-xs text-neutral-400" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
          <ul className="text-xs text-neutral-400 space-y-1 max-h-32 overflow-auto">
            {(sources.data?.sources || []).map((source: { id: string; kind: string; title: string }) => (
              <li key={source.id}>{source.kind}: {source.title}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="border border-white/10 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-white">Test chat</h2>
        <div className="space-y-2 max-h-72 overflow-auto">
          {chat.map((item, index) => (
            <p key={index} className={item.role === "user" ? "text-sm text-white" : "text-sm text-neutral-300"}>{item.role === "user" ? "You" : "Agent"}: {item.content}</p>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={field} value={message} placeholder="ازيك، السعر كام؟" onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendPlayground()} />
          <button type="button" onClick={sendPlayground} className={button}>Send</button>
        </div>
      </section>
      <section className="border border-white/10 rounded-2xl overflow-hidden">
        <h2 className="text-sm font-medium text-white px-4 py-3">Recent answers</h2>
        {logs.isLoading ? <Loader2 className="w-4 h-4 m-4 animate-spin text-white/30" /> : (
          <table className="w-full text-sm text-start">
            <tbody>
              {(logs.data?.logs || []).map((log: { id: string; question: string; answer: string; dialect: string; confidence: number; handoff: boolean }) => (
                <tr key={log.id} className="border-t border-white/5 text-neutral-300">
                  <td className="px-4 py-3 align-top text-white">{log.question}</td>
                  <td className="px-4 py-3 align-top">{log.answer}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-xs">{log.dialect} · {Math.round(Number(log.confidence) * 100)}%{log.handoff ? " · handoff" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const field = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
const button = "text-sm px-3 py-2 rounded-lg bg-white text-black font-medium"
