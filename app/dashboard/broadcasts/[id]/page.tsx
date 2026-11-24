"use client"
import Link from "next/link"

import { use } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Loader2 } from "lucide-react"

export default function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = useSWR(`/api/broadcasts/${id}`, fetcher)
  if (isLoading || !data?.broadcast) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
  const stats = data.stats || {}
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <Link href="/dashboard/broadcasts" className="text-xs text-neutral-500">Broadcasts</Link>
      <h1 className="text-2xl text-white font-semibold">{data.broadcast.name}</h1>
      <p className="text-sm text-neutral-400">{data.broadcast.channel} · {data.broadcast.status}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["sent", "opened", "clicked", "skipped", "failed", "queued"].map((key) => (
          <div key={key} className="rounded-xl border border-white/10 p-3">
            <div className="text-xl text-white tabular-nums">{stats[key] || 0}</div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{key}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
