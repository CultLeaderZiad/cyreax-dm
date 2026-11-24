"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * A curved horizon of square voxels rolling like a calm sea.
 * Original canvas implementation: no dependencies, colours come from the
 * theme tokens (--gold / --bg), so it follows light, dark and gold themes.
 * Pauses when the tab is hidden and draws one still frame when the visitor
 * prefers reduced motion.
 */
export function VoxelArc({ className = "", intensity = 0.4 }: { className?: string; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    let w = 0
    let h = 0
    let rgb: [number, number, number] = [161, 98, 7]
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const readColor = () => {
      const probe = document.createElement("span")
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "#A16207"
      document.body.appendChild(probe)
      const m = getComputedStyle(probe).color.match(/\d+/g)
      probe.remove()
      if (m && m.length >= 3) rgb = [Number(m[0]), Number(m[1]), Number(m[2])]
    }
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const COLS = 90
    const ROWS = 34
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const horizon = h * 0.52
      for (let r = ROWS - 1; r >= 0; r--) {
        const depth = r / (ROWS - 1) // 0 = near, 1 = far
        const scale = 1 - depth * 0.82
        const y0 = horizon + (h - horizon) * Math.pow(1 - depth, 1.6) * 1.05
        const size = Math.max(1.2, (w / COLS) * scale * 0.62)
        const spread = w * (0.35 + 1.15 * scale)
        for (let c = 0; c < COLS; c++) {
          const u = c / (COLS - 1) - 0.5
          const wave =
            Math.sin(u * 7 + t * 0.00055 + depth * 5) * 0.55 +
            Math.sin(u * 13 - t * 0.0004 + depth * 9) * 0.3 +
            Math.sin(depth * 11 + t * 0.0007) * 0.25
          const arc = -u * u * 120 * scale // curved horizon
          const x = w / 2 + u * spread
          const y = y0 + arc - wave * 38 * scale
          if (x < -size || x > w + size) continue
          const lift = (wave + 1.1) / 2.2
          const fade = Math.pow(1 - depth, 0.6) * (0.25 + lift * 0.75)
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(fade * intensity).toFixed(3)})`
          ctx.fillRect(x - size / 2, y - size / 2, size, size)
        }
      }
    }

    const loop = (t: number) => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduce) raf = requestAnimationFrame(loop)
    }

    readColor()
    resize()
    const observer = new MutationObserver(() => { readColor(); if (reduce) draw(0) })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
    window.addEventListener("resize", resize)
    document.addEventListener("visibilitychange", onVisibility)
    if (reduce) draw(0)
    else raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [intensity])

  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />
}

/** Fixed, click-through backdrop for the whole app (marketing pages and dashboards). */
export function VoxelArcBackdrop() {
  // Calmer inside the dashboard, where people work; full strength on public pages.
  const inDashboard = usePathname()?.startsWith("/dashboard")
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <VoxelArc intensity={inDashboard ? 0.16 : 0.4} />
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)] via-transparent to-transparent opacity-80" />
    </div>
  )
}
