"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

/** Fades and lifts its children in the first time they scroll into view. Shows at once for reduced motion. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const style: CSSProperties = { transitionDelay: `${delay}ms` }
  return (
    <div ref={ref} style={style} className={`transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}>
      {children}
    </div>
  )
}

/** A card with a soft gold spotlight that follows the pointer. */
export function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        el.style.setProperty("--mx", `${e.clientX - r.left}px`)
        el.style.setProperty("--my", `${e.clientY - r.top}px`)
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0b11] transition-all duration-300 hover:-translate-y-1 hover:border-[#e5a93c]/40 hover:shadow-[0_20px_60px_-20px_rgba(229,169,60,0.25)] ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), rgba(229,169,60,0.13), transparent 60%)" }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  )
}
