// Generates app/light-compat.css: light-mode replacements for the dark-only
// Tailwind colour classes used across the app (text-white, bg-white/5,
// border-white/10, bg-[#03010A], text-neutral-400, text-[#e5a93c], ...).
//
// Why: many pages were written for dark mode only. In light mode those
// classes produce white text on white, invisible inputs and black islands.
// This maps each one to the theme tokens in app/globals.css (--t1, --s1,
// --line, --gold ...) when <html> is not .dark. Dark mode is untouched.
//
//   pnpm theme:compat           regenerate after adding pages
//   pnpm theme:compat --check   fail if the CSS is stale (tests use this)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["app", "components", "hooks"]
const OUT = "app/light-compat.css"

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : []
  })
}

const VARIANTS = "(?:(?:hover|focus|focus-visible|focus-within|group-hover|active|placeholder|disabled):)?"
const CLASS = new RegExp(
  "(?<![\\w-])" + VARIANTS + "(" + [
    "text-white(?:/[0-9]+)?",
    "text-(?:neutral|gray|zinc|slate|stone)-[1-6]00",
    "placeholder-(?:neutral|gray|zinc)-[3-6]00",
    "bg-white/(?:[0-9]+|\\[0?\\.[0-9]+\\])",
    "border-white/(?:[0-9]+|\\[0?\\.[0-9]+\\])",
    "divide-white/(?:[0-9]+|\\[0?\\.[0-9]+\\])",
    "ring-white/(?:[0-9]+|\\[0?\\.[0-9]+\\])",
    "bg-black(?:/[0-9]+)?",
    "bg-(?:neutral|zinc|gray|slate|stone)-(?:800|900|950)(?:/[0-9]+)?",
    "border-(?:neutral|zinc|gray|slate|stone)-(?:700|800|900)(?:/[0-9]+)?",
    "bg-\\[#[0-9a-fA-F]{6}\\](?:/[0-9]+)?",
    "border-\\[#[0-9a-fA-F]{6}\\]",
    "text-\\[#(?:e5a93c|E5A93C|D6AE5C|d6ae5c|e5a73c)\\]",
  ].join("|") + ")(?![\\w/\\[-])",
  "g",
)

const found = new Set()
for (const root of ROOTS) for (const f of files(root)) for (const m of readFileSync(f, "utf8").matchAll(CLASS)) found.add(m[0])

const alpha = (s) => {
  const m = s.match(/\/(?:\[0?(\.[0-9]+)\]|([0-9]+))$/)
  return m ? (m[1] ? Number(m[1]) : Number(m[2]) / 100) : 1
}
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ink = (a) => `rgba(17, 24, 39, ${Math.min(0.14, Math.max(0.025, a * 0.6)).toFixed(3)})`

/** Returns [property, value] for the light-mode equivalent, or null to leave as is. */
function mapping(base) {
  if (/^text-white/.test(base)) return ["color", "var(--t1)"]
  let m = base.match(/^text-(?:neutral|gray|zinc|slate|stone)-([1-6])00$/)
  if (m) return ["color", Number(m[1]) <= 3 ? "var(--t2)" : Number(m[1]) === 4 ? "var(--t3)" : "var(--t4)"]
  if (/^placeholder-/.test(base)) return ["color", "var(--t4)"]
  if (/^text-\[#/.test(base)) return ["color", "var(--gold)"]
  if (/^bg-white\//.test(base)) return ["background-color", ink(alpha(base))]
  if (/^(border|divide)-white\//.test(base)) return ["border-color", alpha(base) >= 0.15 ? "var(--line2)" : "var(--line)"]
  if (/^ring-white\//.test(base)) return ["--tw-ring-color", "var(--line2)"]
  if (/^bg-black/.test(base)) return alpha(base) < 1 && alpha(base) >= 0.5 ? null : ["background-color", alpha(base) < 1 ? "var(--s2)" : "var(--s1)"]
  m = base.match(/^bg-(?:neutral|zinc|gray|slate|stone)-(800|900|950)/)
  if (m) return ["background-color", m[1] === "800" ? "var(--s2)" : "var(--s1)"]
  if (/^border-(?:neutral|zinc|gray|slate|stone)-/.test(base)) return ["border-color", "var(--line)"]
  m = base.match(/^bg-\[(#[0-9a-fA-F]{6})\]/)
  if (m) {
    if (luminance(m[1]) >= 0.12) return null
    // The near-black page backdrop becomes the page colour; every other dark
    // surface (cards, panels, inputs) becomes a white card so nothing reads as a black box.
    return ["background-color", /^#0[0-3]0[0-1]0[a-fA-F0-9]$/.test(m[1]) && !base.includes("/") ? "var(--bg)" : "var(--s1)"]
  }
  m = base.match(/^border-\[(#[0-9a-fA-F]{6})\]/)
  if (m) return luminance(m[1]) < 0.12 ? ["border-color", "var(--line)"] : null
  return null
}

const esc = (cls) => cls.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c)

// White text stays white on solid coloured buttons/badges and on images.
const KEEP_WHITE = [
  "red", "rose", "pink", "fuchsia", "purple", "violet", "indigo", "blue", "sky", "cyan",
  "teal", "emerald", "green", "lime", "amber", "orange", "yellow",
].flatMap((c) => [`[class*="bg-${c}-5"]`, `[class*="bg-${c}-6"]`, `[class*="bg-${c}-7"]`, `[class*="bg-${c}-8"]`])
  .concat([
    '[class*="bg-[#0084FF]"]', '[class*="bg-[#e60000]"]', '[class*="bg-[#E60000]"]', '[class*="bg-[#25D366]"]',
    '[class*="bg-gradient"]', '[class*="bg-linear"]', '[class*="bg-primary"]', '[class*="bg-destructive"]',
    '[class*="bg-[#2"]', '[class*="bg-[#3"]', '[class*="bg-[#4"]', '[class*="bg-[#5"]', '[class*="bg-[#6"]',
    '[class*="bg-[#7"]', '[class*="bg-[#8"]', '[class*="bg-[#9"]', '[class*="bg-[#a"]', '[class*="bg-[#A"]',
    '[class*="bg-[#b"]', '[class*="bg-[#B"]', '[class*="bg-[#c"]', '[class*="bg-[#C"]', '[class*="bg-[#d"]',
    '[class*="bg-[#D"]', '[class*="bg-[#e"]', '[class*="bg-[#E"]', '[class*="bg-[#f"]', '[class*="bg-[#F"]',
    "[data-keep-dark]",
  ])
const notSolid = KEEP_WHITE.map((s) => `:not(${s})`).join("")

const rules = []
const gold = []
for (const cls of [...found].sort()) {
  const variant = cls.match(/^([a-z-]+):/)?.[1] || ""
  const base = variant ? cls.slice(variant.length + 1) : cls
  const map = mapping(base)
  if (!map) continue
  const [prop, value] = map
  // Translucent black overlays behind modals stay dark (handled by mapping null).
  let selector = `.${esc(cls)}`
  if (variant === "hover") selector += ":hover"
  else if (variant === "focus") selector += ":focus"
  else if (variant === "focus-visible") selector += ":focus-visible"
  else if (variant === "focus-within") selector += ":focus-within"
  else if (variant === "active") selector += ":active"
  else if (variant === "disabled") selector += ":disabled"
  else if (variant === "group-hover") selector = `.group:hover ${selector}`
  else if (variant === "placeholder") selector += "::placeholder"
  if (/^placeholder-/.test(base)) selector += "::placeholder"
  const guard = base.startsWith("text-white") ? notSolid : ""
  const island = ":not([data-keep-dark] *)"
  if (/^divide-/.test(base)) {
    rules.push(`:root:not(.dark):not(.gold) ${selector}${island} > :not(:last-child) { ${prop}: ${value}; }`)
  } else {
    rules.push(`:root:not(.dark):not(.gold) ${selector}${guard}${island} { ${prop}: ${value}; }`)
  }
  // Gold is a dark theme: translucent white overlays already work there, but
  // hardcoded near-black surfaces, greys and gold accents should pick up the
  // warm Gold tokens so every page (not only token-based ones) turns gold.
  if (!/^(bg|border|divide|ring)-white\//.test(base) && !/^placeholder-/.test(base)) {
    const goldValue = base.startsWith("text-white") ? "var(--t1)" : value
    gold.push(`.gold ${selector}${guard}${island} { ${prop}: ${goldValue}; }`)
  }
}

const css = [
  "/* Generated by scripts/gen-light-compat.mjs (pnpm theme:compat). Do not edit by hand.",
  " * Light-mode equivalents for dark-only colour classes. Dark mode is untouched.",
  " * Wrap an intentionally dark island (e.g. a QR code card on purpose) in data-keep-dark. */",
  "",
  ...rules,
  "",
  "/* Gold (premium) theme: same classes, warm Gold tokens. */",
  ...gold,
  "",
].join("\n")

if (process.argv.includes("--check")) {
  const current = (() => { try { return readFileSync(OUT, "utf8") } catch { return "" } })()
  if (current !== css) { console.error(`${OUT} is stale. Run: pnpm theme:compat`); process.exit(1) }
} else {
  writeFileSync(OUT, css)
  console.log(`wrote ${OUT} (${rules.length} rules from ${found.size} classes)`)
}
