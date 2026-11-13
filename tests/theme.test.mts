import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

describe("themes", () => {
  it("app/light-compat.css is regenerated from the current classes (pnpm theme:compat)", () => {
    execFileSync("node", ["scripts/gen-light-compat.mjs", "--check"], { stdio: "pipe" })
  })
  it("light, dark and gold are registered and gold reuses every dark: style", () => {
    const provider = readFileSync("components/theme-provider.tsx", "utf8")
    assert.match(provider, /themes=\{\["light", "dark", "gold"\]\}/)
    const css = readFileSync("app/globals.css", "utf8")
    assert.match(css, /@custom-variant dark \(&:is\(\.dark, \.dark \*, \.gold, \.gold \*\)\)/)
    assert.match(css, /:root:not\(\.dark\):not\(\.gold\) \{/)
    assert.match(css, /\.gold \{\n  --bg:/)
  })
  it("primary buttons stay readable in every theme", () => {
    const button = readFileSync("components/ui/button.tsx", "utf8")
    const primary = button.match(/primary:\s*\n\s*'([^']*)'/)?.[1] || ""
    assert.match(primary, /bg-\[var\(--t1\)\] text-\[var\(--bg\)\]/, "primary text must follow the theme, not a fixed dark hex")
    assert.doesNotMatch(primary, /#0B0B0D|hover:bg-white/)
  })
  it("no placeholder numbers in the navigation", () => {
    const tree = readFileSync("components/nav/SidebarTree.tsx", "utf8")
    assert.doesNotMatch(tree, /\?\? 8240|\?\? 10000/)
    assert.doesNotMatch(readFileSync("components/nav/MobileTabBar.tsx", "utf8"), /unreadCount = 12/)
  })
})
