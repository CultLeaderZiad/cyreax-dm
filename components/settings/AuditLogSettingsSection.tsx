"use client"

import React from "react"
import { ShieldCheck, User } from "lucide-react"
import { Pill } from "@/components/ui/Pill"

const auditEvents = [
  { id: "1", action: "member.invited", actor: "Workspace Admin", target: "sara@mirage.agency", ip: "197.34.82.11 · Cairo", time: "2 days ago" },
  { id: "2", action: "role.updated", actor: "Workspace Admin", target: "Nour Adel -> client-viewer", ip: "197.34.82.11 · Cairo", time: "Yesterday" },
  { id: "3", action: "whitelabel.updated", actor: "Workspace Admin", target: "portal.mirage.agency", ip: "197.34.82.11 · Cairo", time: "3 days ago" },
  { id: "4", action: "api_key.created", actor: "Workspace Admin", target: "Zapier & Make Automations", ip: "197.34.82.11 · Cairo", time: "4 weeks ago" },
  { id: "5", action: "workspace.created", actor: "Workspace Admin", target: "Sakan Real Estate", ip: "197.34.82.11 · Cairo", time: "1 month ago" },
]

export function AuditLogSettingsSection() {
  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Audit log
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Immutable event trail of administrative actions, role assignments, and security updates.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Security trail
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Events are preserved for 12 months for compliance and SOC2 auditing.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-[12px] border-collapse" aria-label="Audit log table">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                    <th scope="col" className="py-2.5 px-4 font-medium">Event</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Actor</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Details</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Location</th>
                    <th scope="col" className="py-2.5 px-4 font-medium text-end">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {auditEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-[var(--s2)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-[var(--t1)] font-medium">
                        {ev.action}
                      </td>
                      <td className="py-3 px-3 text-[var(--t2)]">
                        {ev.actor}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[var(--t3)]">
                        {ev.target}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[var(--t3)] font-mono">
                        {ev.ip}
                      </td>
                      <td className="py-3 px-4 text-end text-[11px] text-[var(--t3)]">
                        {ev.time}
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
