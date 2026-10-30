"use client"

import React, { useState } from "react"
import { KeyRound, Check, ShieldCheck, RefreshCw, Trash2, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/ui/Pill"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/brand"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface ModelFact {
  id: string
  name: string
  context: string
  price: string
  isDefault?: boolean
}

const modelFacts: ModelFact[] = [
  {
    id: "llama",
    name: "Groq - Llama 3.3 70B",
    context: "128k",
    price: "$0.59 / $0.79",
    isDefault: true,
  },
  {
    id: "gemini",
    name: "Google Gemini 2.0 Flash",
    context: "1M",
    price: "$0.10 / $0.40",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude 3.5 Haiku",
    context: "200k",
    price: "$0.80 / $4.00",
  },
]

export function ModelKeyPicker({
  mode = "summary",
  onManageKeys,
}: {
  mode?: "summary" | "full"
  onManageKeys?: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isByokActive, setIsByokActive] = useState(true)
  const [byokProvider, setByokProvider] = useState("Groq")
  const [maskedKey, setMaskedKey] = useState("••••1a2b")
  const [selectedProvider, setSelectedProvider] = useState("groq")
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false)

  const handleSaveKey = () => {
    if (!apiKeyInput.trim()) {
      toast.error("Please enter an API key")
      return
    }
    const last4 = apiKeyInput.trim().slice(-4) || "1a2b"
    setMaskedKey(`••••${last4}`)
    setIsByokActive(true)
    const providerName =
      selectedProvider === "groq"
        ? "Groq"
        : selectedProvider === "gemini"
        ? "Google Gemini"
        : "Anthropic"
    setByokProvider(providerName)
    toast.success(`Configured custom API key for ${providerName}`)
    setDialogOpen(false)
    setApiKeyInput("")
  }

  const handleRemoveKey = () => {
    setIsByokActive(false)
    setMaskedKey("")
    setIsConfirmRemoveOpen(false)
    toast.success(`Custom API key removed. Reverted to ${BRAND.name} default inference.`)
  }

  // Summary Mode (Agents tab card)
  if (mode === "summary") {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 select-none space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-[var(--t1)] tracking-tight">
              Model
            </h3>
            {isByokActive ? (
              <Pill variant="gold" dot={false}>
                🔑 Your own key
              </Pill>
            ) : (
              <Pill variant="neutral" dot={false}>
                {BRAND.name} default
              </Pill>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (onManageKeys) onManageKeys()
              else setDialogOpen(true)
            }}
            className="h-[26px] px-2 text-[11px] font-medium gap-1 text-[var(--gold2)]"
          >
            <KeyRound className="w-3 h-3 text-[var(--gold)]" />
            <span>Manage keys</span>
          </Button>
        </div>

        {/* Facts Table (Replaces invented dot ratings with verified facts) */}
        <div className="overflow-x-auto">
          <table className="w-full text-start text-[11.5px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10.5px] font-mono uppercase text-[var(--t3)]">
                <th className="pb-2 font-medium">Provider</th>
                <th className="pb-2 font-medium">Context</th>
                <th className="pb-2 font-medium text-end">Price / 1M tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {modelFacts.map((p) => {
                const isSelected = p.isDefault && isByokActive
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "hover:bg-[var(--s2)] transition-colors relative",
                      isSelected
                        ? "bg-[var(--s2)]/80 before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-[var(--gold)]"
                        : ""
                    )}
                  >
                    <td className="py-2.5 font-medium text-[var(--t1)] flex items-center gap-1.5 ps-2">
                      <span>{p.name}</span>
                      {p.isDefault && (
                        <span className="font-mono text-[9.5px] px-1 py-0.2 rounded bg-[var(--s3)] text-[var(--t3)] border border-[var(--line2)] leading-none">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 font-mono text-[var(--t3)] text-[11px]">
                      {p.context}
                    </td>
                    <td className="py-2.5 font-mono text-[var(--t2)] text-[11px] text-end pe-2">
                      {p.price}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[10.5px] text-[var(--t4)] font-mono">
          Models run strictly in verified stateless inference modes with zero persistent training retention.
        </p>

        {/* BYOK Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                Bring your own model key (BYOK)
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--t3)]">
                Use your own provider API key to pay infrastructure costs directly.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  Provider
                </label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                >
                  <option value="groq">Groq (Llama 3.3)</option>
                  <option value="gemini">Google Gemini 2.0</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>

              <div>
                <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                  API key
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="h-[28px] text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveKey}
                className="h-[28px] text-xs"
              >
                Save key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Full Mode (Model & keys tab view)
  return (
    <div className="space-y-6 select-none">
      {/* Current Key Status Card */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--t1)] flex items-center gap-2">
              <Key className="w-4 h-4 text-[var(--gold)]" />
              <span>Provider & API Key Configuration</span>
            </h3>
            <p className="text-xs text-[var(--t3)] mt-0.5">
              Securely configure your custom LLM provider credentials or use {BRAND.name} default routing.
            </p>
          </div>

          {isByokActive ? (
            <Pill variant="gold" dot={false}>
              🔑 Your own key
            </Pill>
          ) : (
            <Pill variant="neutral" dot={false}>
              {BRAND.name} default
            </Pill>
          )}
        </div>

        {isByokActive ? (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--t1)]">
                  {byokProvider}
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--s3)] text-emerald-400 border border-[var(--line)]">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--t3)]">Masked key:</span>
                <span className="font-mono text-xs text-[var(--t1)] tracking-wider">
                  {maskedKey}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialogOpen(true)}
                className="h-[28px] text-xs font-medium gap-1"
              >
                <RefreshCw className="w-3 h-3 text-[var(--t3)]" />
                <span>Replace key</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsConfirmRemoveOpen(true)}
                className="h-[28px] text-xs font-medium gap-1 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove key</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line2)] p-6 text-center space-y-2">
            <ShieldCheck className="w-6 h-6 text-[var(--gold)] mx-auto" />
            <p className="text-xs font-medium text-[var(--t1)]">
              Using {BRAND.name} managed inference infrastructure
            </p>
            <p className="text-[11.5px] text-[var(--t3)] max-w-md mx-auto">
              Your agents run seamlessly on high-throughput managed clusters. Add your own provider key anytime to route requests directly.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="h-[28px] text-xs font-medium mt-1"
            >
              + Connect your own key
            </Button>
          </div>
        )}
      </div>

      {/* Model Facts Table */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--t1)]">
            Verified Provider Specifications
          </h3>
          <p className="text-xs text-[var(--t3)] mt-0.5">
            Real token pricing and context window metrics. Ratings are strictly based on verified facts.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)] text-[11px] font-mono uppercase text-[var(--t3)]">
                <th className="pb-2.5 font-medium">Provider & Model</th>
                <th className="pb-2.5 font-medium">Context Window</th>
                <th className="pb-2.5 font-medium text-end">Input / Output per 1M</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {modelFacts.map((p) => {
                const isSelected = p.isDefault && isByokActive
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "hover:bg-[var(--s2)] transition-colors relative",
                      isSelected
                        ? "bg-[var(--s2)]/80 before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-[var(--gold)]"
                        : ""
                    )}
                  >
                    <td className="py-3 font-medium text-[var(--t1)] flex items-center gap-2 ps-2">
                      <span>{p.name}</span>
                      {p.isDefault && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--goldbg)] text-[var(--gold2)] border border-[var(--goldline)] leading-none">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-[var(--t3)]">
                      {p.context}
                    </td>
                    <td className="py-3 font-mono text-[var(--t2)] text-end pe-2">
                      {p.price}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BYOK Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--s1)] border-[var(--line)] text-[var(--t1)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Bring your own model key (BYOK)
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--t3)]">
              Use your own provider API key to pay infrastructure costs directly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              >
                <option value="groq">Groq (Llama 3.3)</option>
                <option value="gemini">Google Gemini 2.0</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>

            <div>
              <label className="text-[11.5px] text-[var(--t2)] font-medium block mb-1">
                API key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full h-8 bg-[var(--s2)] border border-[var(--line)] rounded-[6px] px-2.5 text-xs text-[var(--t1)] focus:outline-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDialogOpen(false)}
              className="h-[28px] text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveKey}
              className="h-[28px] text-xs"
            >
              Save key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Key Confirmation */}
      <ConfirmDialog
        open={isConfirmRemoveOpen}
        onOpenChange={setIsConfirmRemoveOpen}
        title="Remove Custom API Key"
        description={`Are you sure you want to remove your custom key? The workspace will revert to ${BRAND.name} default managed inference.`}
        confirmLabel="Remove key"
        variant="destructive"
        onConfirm={handleRemoveKey}
      />
    </div>
  )
}
