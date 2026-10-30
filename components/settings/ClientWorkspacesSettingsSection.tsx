"use client"

import React, { useState, useEffect } from "react"
import { Layers, Plus, ExternalLink } from "lucide-react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface WorkspaceItem {
  id: string
  name: string
  handle: string
  channels?: number
  status?: string
}

const defaultWorkspacesList: WorkspaceItem[] = [
  { id: "1", name: "Primary Workspace", handle: "@primary", channels: 3, status: "active" },
]

export function ClientWorkspacesSettingsSection() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(defaultWorkspacesList)

  useEffect(() => {
    fetch("/api/workspaces")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.workspaces) && data.workspaces.length > 0) {
          setWorkspaces(
            data.workspaces.map((w: any) => ({
              id: w.id,
              name: w.name,
              handle: `@${w.name.toLowerCase().replace(/\s+/g, "_")}`,
              channels: 1,
              status: "active",
            }))
          )
        }
      })
      .catch(console.error)
  }, [])

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Client workspaces
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Manage isolated client workspaces, channel allocations, and seat assignments.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Workspaces
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              {workspaces.length} client workspace{workspaces.length !== 1 ? "s" : ""} active.
            </p>
            <Button asChild variant="primary" size="sm" className="h-[28px] text-[11.5px] gap-1">
              <Link href="/dashboard/billing">
                <Plus className="w-3.5 h-3.5" />
                <span>Add workspace</span>
              </Link>
            </Button>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-[12px] border-collapse" aria-label="Workspaces table">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                    <th scope="col" className="py-2.5 px-4 font-medium">Workspace</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Channels</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Status</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-end">Switch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {workspaces.map((ws) => (
                    <tr key={ws.id} className="hover:bg-[var(--s2)]/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-medium text-[12.5px] text-[var(--t1)] block">
                          {ws.name}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--t3)] block">
                          {ws.handle}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11.5px] text-[var(--t2)] tabular-nums">
                        {ws.channels} connected
                      </td>
                      <td className="py-3 px-3">
                        <Pill variant="green" dot className="text-[10px]">
                          Active
                        </Pill>
                      </td>
                      <td className="py-3 px-4 text-end">
                        <Button variant="ghost" size="sm" className="h-[26px] text-[11.5px] text-[var(--t3)] hover:text-[var(--t1)]">
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
