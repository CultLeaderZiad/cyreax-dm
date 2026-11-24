"use client"

import { PLAN_CATALOG, describeEntitlements, type InsightsLevel, type PlanLimits } from "@/lib/billing/plans"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Defaults for a plan: the code catalog entry its "grants" tier points at. */
export function defaultLimitsFor(catalogPlanId: string | null | undefined): PlanLimits {
  const entry = PLAN_CATALOG.find((p) => p.id === catalogPlanId) || PLAN_CATALOG.find((p) => p.id === "creator")!
  return { ...entry.limits }
}

const NUMBERS: Array<{ key: "channels" | "contacts" | "aiReplies" | "aiRequests" | "broadcasts" | "workspaces" | "seats"; label: string; hint: string }> = [
  { key: "channels", label: "Channels", hint: "Connected Instagram / Facebook / WhatsApp / Telegram / TikTok accounts" },
  { key: "contacts", label: "Contacts", hint: "People the inbox can store" },
  { key: "aiReplies", label: "AI replies / month", hint: "Automatic replies to customer messages" },
  { key: "aiRequests", label: "AI requests / month", hint: "Recommendations, the Growth Agent and analytics (not auto-replies)" },
  { key: "broadcasts", label: "Broadcasts / month", hint: "0 = none" },
  { key: "workspaces", label: "Client workspaces", hint: "Agencies manage one per client" },
  { key: "seats", label: "Team seats", hint: "People who can sign in to the workspace" },
]

const TOGGLES: Array<{ key: "aiAgent" | "apiAccess" | "whiteLabel"; label: string; hint: string }> = [
  { key: "aiAgent", label: "AI Growth Agent", hint: "Chat assistant that analyses the account and prepares actions" },
  { key: "apiAccess", label: "Public API", hint: "API keys and webhooks" },
  { key: "whiteLabel", label: "White-label & client reports", hint: "Custom branding and agency reports" },
]

/**
 * Full admin control over what a plan includes. Saved into plans.entitlements
 * and enforced on the server on every request: no deploy needed.
 * -1 means unlimited.
 */
export function EntitlementsEditor({
  catalogPlanId,
  value,
  onChange,
}: {
  catalogPlanId: string | null | undefined
  /** null = use the defaults for the selected tier */
  value: PlanLimits | null
  onChange: (next: PlanLimits | null) => void
}) {
  const defaults = defaultLimitsFor(catalogPlanId)
  const current = value ?? defaults
  const set = (patch: Partial<PlanLimits>) => onChange({ ...current, ...patch })

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Limits &amp; features</p>
          <p className="text-[11px] text-neutral-500">
            {value ? "Custom for this plan." : "Using the defaults for the selected tier."} Use -1 for unlimited. Changes apply immediately.
          </p>
        </div>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-neutral-400 hover:text-white underline">
            Reset to defaults
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {NUMBERS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-neutral-300 text-xs">{field.label}</Label>
            <Input
              type="number"
              min={-1}
              step={1}
              className="bg-white/5 border-white/10 text-white"
              value={current[field.key]}
              onChange={(e) => {
                const n = Math.trunc(Number(e.target.value))
                if (Number.isFinite(n)) set({ [field.key]: Math.max(-1, n) } as Partial<PlanLimits>)
              }}
              title={field.hint}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-neutral-300 text-xs">AI recommendations</Label>
        <select
          className="w-full h-9 rounded-md bg-white/5 border border-white/10 text-white px-2 text-sm"
          value={current.insights}
          onChange={(e) => set({ insights: e.target.value as InsightsLevel })}
        >
          <option value="none">Off</option>
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
        </select>
      </div>

      <div className="space-y-2">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex items-start gap-2 text-sm text-neutral-200 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={current[toggle.key]}
              onChange={(e) => set({ [toggle.key]: e.target.checked } as Partial<PlanLimits>)}
            />
            <span>
              {toggle.label}
              <span className="block text-[11px] text-neutral-500">{toggle.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="border-t border-white/10 pt-2">
        <p className="text-[11px] text-neutral-500 mb-1">Customers will see:</p>
        <ul className="text-xs text-neutral-300 space-y-0.5">
          {describeEntitlements(current).map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
