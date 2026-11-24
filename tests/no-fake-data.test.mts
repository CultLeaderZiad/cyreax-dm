/**
 * Guard against fabricated data creeping back into the product UI: invented
 * growth numbers, sample customers, demo rows. A customer must only ever see
 * numbers and names the system measured.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const ROOTS = ["app/dashboard", "components", "app/pricing", "app/checkout"]
const FORBIDDEN: Array<[RegExp, string]> = [
  [/delta="[+-]\d/, "a hardcoded KPI delta"],
  [/sparklinePoints=\{\[\d/, "a hardcoded sparkline series"],
  [/Vitamin C/i, "the sample Vitamin C product"],
  [/Glow kit/i, "the sample Glow kit"],
  [/mirage\.agency|Sakan Real Estate|Nour Adel/, "sample agency rows"],
  [/Cairo, Egypt . Chrome on Windows/, "an invented session location"],
  [/tariq@|lina@mirage|omar@mirage/, "sample team members"],
  [/automation\.id === "demo-/, "demo automations"],
  [/\bHelix(a)?\b/, "the old product name"],
  [/set to be added soon/i, "a stale roadmap promise"],
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path)
    return /\.(tsx?|mts)$/.test(name) ? [path] : []
  })
}

describe("no fabricated data in the UI", () => {
  const sources = ROOTS.flatMap((root) => files(root)).map((path) => ({ path, text: readFileSync(path, "utf8") }))

  for (const [pattern, what] of FORBIDDEN) {
    it(`contains no ${what}`, () => {
      const hits = sources.filter((s) => pattern.test(s.text)).map((s) => s.path)
      assert.deepEqual(hits, [])
    })
  }

  it("KPI cards draw a sparkline only from a real series", () => {
    const card = readFileSync("components/ui/KPICard.tsx", "utf8")
    assert.ok(!/\[14, 18, 12, 16, 20, 15, 22\]/.test(card))
  })
})
