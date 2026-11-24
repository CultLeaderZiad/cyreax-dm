import * as React from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export interface KPICardProps {
  label: string
  value: string | number
  delta?: string
  deltaType?: "increase" | "decrease" | "neutral"
  invertDeltaColor?: boolean
  isAiMetric?: boolean
  sparklinePoints?: number[]
  className?: string
}

export function KPICard({
  label,
  value,
  delta,
  deltaType = "increase",
  invertDeltaColor = false,
  isAiMetric = false,
  sparklinePoints,
  className,
}: KPICardProps) {
  const strokeColor = isAiMetric ? "var(--gold)" : "var(--t3)"

  // Render a minimal, GPU-friendly 22px SVG sparkline
  const renderSparkline = () => {
    const points = sparklinePoints
    // Only a real series is drawn; nothing is invented to fill the space.
    if (!points || points.length < 2) return null
    const width = 80
    const height = 22
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = max - min || 1

    const coords = points.map((p, idx) => {
      const x = (idx / (points.length - 1)) * width
      const y = height - ((p - min) / range) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    const pathD = `M ${coords.join(" L ")}`

    return (
      <svg
        className="w-20 h-[22px] shrink-0"
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        aria-hidden="true"
      >
        <path
          d={pathD}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  // Determine delta color: green is good, red is bad
  const isPositive = invertDeltaColor
    ? deltaType === "decrease"
    : deltaType === "increase"

  const deltaColorClass =
    deltaType === "neutral"
      ? "text-[var(--t3)]"
      : isPositive
      ? "text-[var(--green)]"
      : "text-[var(--red)]"

  return (
    <div
      className={cn(
        "rounded-[12px] bg-[var(--s1)] border border-[var(--line)] p-4 flex flex-col justify-between transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--t2)] font-medium mb-2">
        {isAiMetric && (
          <Sparkles className="size-3 text-[var(--gold)] shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[26px] font-semibold tracking-[-0.03em] font-mono text-[var(--t1)] tabular-nums leading-none">
          {value}
        </span>
        {delta && (
          <span className={cn("text-[11.5px] font-mono tabular-nums font-medium", deltaColorClass)}>
            {delta}
          </span>
        )}
      </div>

      {sparklinePoints && sparklinePoints.length >= 2 && (
        <div className="mt-3 flex items-center justify-end">{renderSparkline()}</div>
      )}
    </div>
  )
}
