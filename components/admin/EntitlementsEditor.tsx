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
    <div className="space-y-3 rounded-lg border border-[var(--line)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--t1)]">Limits &amp; features</p>
          <p className="text-[11px] text-[var(--t3)]">
            {value ? "Custom for this plan." : "Using the defaults for the selected tier."} Use -1 for unlimited. Changes apply immediately.
          </p>
        </div>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-[var(--t2)] hover:text-white underline">
            Reset to defaults
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {NUMBERS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-[var(--t2)] text-xs">{field.label}</Label>
            <Input
              type="number"
              min={-1}
              step={1}
              className="bg-[var(--s2)] border-[var(--line)] text-[var(--t1)]"
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

      <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--line)] p-2.5">
        <div className="space-y-1">
          <Label className="text-[var(--t2)] text-xs">Free trial (days)</Label>
          <Input
            type="number"
            min={0}
            max={90}
            step={1}
            className="bg-[var(--s2)] border-[var(--line)] text-[var(--t1)]"
            value={current.trialDays}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value))
              if (Number.isFinite(n)) set({ trialDays: Math.min(90, Math.max(0, n)) })
            }}
            title="0 = no free trial for this plan"
          />
          <p className="text-[10px] text-[var(--t3)]">0 = no trial</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[var(--t2)] text-xs">Trial quota (% of plan)</Label>
          <Input
            type="number"
            min={1}
            max={100}
            step={1}
            className="bg-[var(--s2)] border-[var(--line)] text-[var(--t1)]"
            value={current.trialLimitPercent}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value))
              if (Number.isFinite(n)) set({ trialLimitPercent: Math.min(100, Math.max(1, n)) })
            }}
            title="During the trial, AI replies, AI requests and broadcasts are this percent of the plan's monthly limits"
          />
          <p className="text-[10px] text-[var(--t3)]">Caps AI replies, AI requests and broadcasts during the trial</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[var(--t2)] text-xs">AI recommendations</Label>
        <select
          className="w-full h-9 rounded-md bg-[var(--s2)] border border-[var(--line)] text-[var(--t1)] px-2 text-sm"
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
          <label key={toggle.key} className="flex items-start gap-2 text-sm text-[var(--t1)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={current[toggle.key]}
              onChange={(e) => set({ [toggle.key]: e.target.checked } as Partial<PlanLimits>)}
            />
            <span>
              {toggle.label}
              <span className="block text-[11px] text-[var(--t3)]">{toggle.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="border-t border-[var(--line)] pt-2">
        <p className="text-[11px] text-[var(--t3)] mb-1">Customers will see:</p>
        <ul className="text-xs text-[var(--t2)] space-y-0.5">
          {describeEntitlements(current).map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
