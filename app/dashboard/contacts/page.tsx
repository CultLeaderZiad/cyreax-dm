"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Download, Loader2, Search, Users } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { EmptyState } from "@/components/ui/EmptyState"

interface ContactRow {
  id: string
  channel: string
  external_id: string
  display_name?: string | null
  username?: string | null
  tags: string[]
  email?: string | null
  phone?: string | null
  source?: string | null
  first_seen_at: string
  last_seen_at: string
  last_inbound_at?: string | null
  bot_paused: boolean
}

export default function ContactsPage() {
  const { userId, isLoading } = useInstagramSession()
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState("")
  const params = new URLSearchParams()
  if (query.trim()) params.set("q", query.trim())
  const { data, isLoading: loading, mutate } = useSWR(
    userId ? `/api/contacts?${params.toString()}` : null,
    fetcher,
  )
  const loaded: ContactRow[] = Array.isArray(data?.contacts) ? data.contacts : []
  const tags = useMemo(() => {
    const found = new Set<string>()
    for (const contact of loaded) for (const item of contact.tags || []) found.add(item)
    return [...found].sort()
  }, [loaded])
  const contacts = tag ? loaded.filter((contact) => contact.tags?.includes(tag)) : loaded
  const exportParams = new URLSearchParams(params)
  if (tag) exportParams.set("tag", tag)

  async function togglePause(contact: ContactRow) {
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_paused: !contact.bot_paused }),
    })
    mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Contacts</h1>
          <p className="text-sm text-neutral-400 mt-1">One person per channel. Tags, fields, and the bot pause live here.</p>
        </div>
        <a
          href={`/api/contacts/export?${exportParams.toString()}`}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-white/10 text-neutral-200 hover:bg-white/5"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, tag, email, phone"
            className="w-full bg-black/40 border border-white/10 rounded-xl ps-10 pe-3 py-2 text-sm text-white"
          />
        </div>
        <select
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="">All tags</option>
          {tags.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      {data?.migration_required && (
        <p className="text-sm text-amber-200/90">Run the phase 3 SQL migration before contacts can be stored.</p>
      )}

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-white/30" />
      ) : contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="People who message or comment on a connected channel show up here." />
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-2xl">
          <table className="w-full text-sm text-start">
            <thead className="text-neutral-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Bot</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-white/5 text-neutral-200">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{contact.display_name || contact.username || contact.external_id}</div>
                    <div className="text-xs text-neutral-500">{contact.email || contact.phone || contact.username || contact.external_id}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{contact.channel}</td>
                  <td className="px-4 py-3">{contact.tags?.length ? contact.tags.join(", ") : "—"}</td>
                  <td className="px-4 py-3">{contact.source || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{contact.last_seen_at ? new Date(contact.last_seen_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => togglePause(contact)} className="text-xs underline text-neutral-300">
                      {contact.bot_paused ? "Paused" : "Running"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
