"use client"

import React, { useState } from "react"
import { Key, Plus, Trash2 } from "lucide-react"
import { Button, HoldToConfirm } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/CopyButton"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ApiKeyItem {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsed: string
}

export function ApiKeysSettingsSection() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([
    {
      id: "1",
      name: "Zapier & Make Automations",
      prefix: "cyx_live_9a7f••••••••",
      createdAt: "Sep 14, 2026",
      lastUsed: "2h ago",
    },
    {
      id: "2",
      name: "Custom Agency ERP Sync",
      prefix: "cyx_live_4e2b••••••••",
      createdAt: "Aug 29, 2026",
      lastUsed: "Yesterday",
    },
  ])

  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName) return

    const randomSuffix = Math.random().toString(36).substring(2, 14) + Math.random().toString(36).substring(2, 14)
    const secret = `cyx_live_${randomSuffix}`
    setGeneratedKey(secret)

    const newKey: ApiKeyItem = {
      id: String(Date.now()),
      name: newKeyName,
      prefix: `cyx_live_${randomSuffix.substring(0, 4)}••••••••`,
      createdAt: "Just now",
      lastUsed: "Never",
    }
    setKeys((prev) => [newKey, ...prev])
  }

  const handleRevokeKey = (id: string, name: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id))
    toast.success(`API key "${name}" revoked`)
  }

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          API keys
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Manage REST API secret keys used for webhook signing, Zapier integrations, and custom CRM syncs.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Secret keys
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Keys provide full API access to all workspaces under your agency. Do not share publicly.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setGeneratedKey(null)
                setNewKeyName("")
                setCreateOpen(true)
              }}
              className="h-[28px] text-[11.5px] gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate key</span>
            </Button>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden shadow-xs">
            {keys.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-[var(--t3)]">
                No active API keys found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-[12px] border-collapse" aria-label="API keys table">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                      <th scope="col" className="py-2.5 px-4 font-medium">Name</th>
                      <th scope="col" className="py-2.5 px-3 font-medium">Key Prefix</th>
                      <th scope="col" className="py-2.5 px-3 font-medium">Created</th>
                      <th scope="col" className="py-2.5 px-3 font-medium">Last used</th>
                      <th scope="col" className="py-2.5 px-4 font-medium text-end"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {keys.map((k) => (
                      <tr key={k.id} className="hover:bg-[var(--s2)]/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-[var(--t1)]">
                          {k.name}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[var(--t2)]">
                          <bdi>{k.prefix}</bdi>
                        </td>
                        <td className="py-3 px-3 text-[var(--t3)]">
                          {k.createdAt}
                        </td>
                        <td className="py-3 px-3 text-[var(--t3)]">
                          {k.lastUsed}
                        </td>
                        <td className="py-3 px-4 text-end">
                          <HoldToConfirm
                            label="Hold to revoke"
                            confirmingLabel="Revoking..."
                            onConfirm={() => handleRevokeKey(k.id, k.name)}
                            className="h-[26px] text-[11px] px-2.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[var(--s1)] border-[var(--line)] text-[var(--t1)] sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">
              {generatedKey ? "Save your API key" : "Generate API secret key"}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-[var(--t3)]">
              {generatedKey
                ? "This key will never be displayed in full again. Copy and store it securely."
                : "Enter a memorable description for this integration key."}
            </DialogDescription>
          </DialogHeader>

          {generatedKey ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-[var(--s2)] border border-[var(--line2)] p-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-[var(--gold2)] break-all select-all">
                  {generatedKey}
                </span>
                <CopyButton value={generatedKey} label="API key" className="shrink-0" />
              </div>
              <DialogFooter>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreateOpen(false)}
                  className="h-[30px] text-xs"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleGenerateKey} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label htmlFor="key-name-input" className="text-[11.5px] text-[var(--t2)] font-medium">
                  Key name
                </label>
                <input
                  id="key-name-input"
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. HubSpot Sync Webhooks"
                  className="w-full h-[32px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] px-2.5 text-[12px] text-[var(--t1)] outline-none focus:border-[var(--line3)]"
                />
              </div>

              <DialogFooter className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreateOpen(false)}
                  className="h-[30px] text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="h-[30px] text-xs"
                >
                  Create key
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
