"use client"

import React from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

interface Entry {
  id: string
  action: string
  details?: Record<string, unknown> | null
  created_at: string
  admin?: { username?: string | null } | null
  target?: { username?: string | null } | null
}

/**
 * The platform's admin audit trail. Only platform admins can read it (the API
 * checks); everyone else sees an honest empty state, never invented rows.
 */
export function AuditLogSettingsSection() {
  const { data, isLoading } = useSWR<{ data?: Entry[]; entries?: Entry[] } | Entry[]>("/api/admin/audit-log?limit=50", fetcher, { shouldRetryOnError: false })
  const raw = data as any
  const entries: Entry[] = Array.isArray(raw) ? raw : raw?.data || raw?.entries || raw?.logs || []

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold tracking-tight text-[var(--t1)]">Audit log</h1>
        <p className="text-[12.5px] text-[var(--t2)]">Administrative actions on accounts, plans and payments, newest first.</p>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--s1)]" />
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-6 text-[13px] text-[var(--t2)]">No events recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--s1)]">
          <table className="w-full border-collapse text-start text-[12px]" aria-label="Audit log table">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                <th scope="col" className="px-4 py-2.5 font-medium">Event</th>
                <th scope="col" className="px-3 py-2.5 font-medium">By</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Account</th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {entries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-[var(--s2)]/50">
                  <td className="px-4 py-3 font-mono text-[11px] font-medium text-[var(--t1)]">{entry.action}</td>
                  <td className="px-3 py-3 text-[var(--t2)]">{entry.admin?.username || "-"}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-[var(--t3)]">{entry.target?.username || "-"}</td>
                  <td className="px-4 py-3 text-end text-[11px] text-[var(--t3)]">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
