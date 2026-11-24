"use client"

import { useSyncExternalStore } from "react"
import { parseRange, type RangeKey } from "@/lib/analytics/period"

/**
 * The date range shared by the top bar's selector and the overview cards, so
 * choosing "30 days" in the bar actually changes the numbers. Kept for the
 * session in this tab.
 */
const KEY = "overview-range"
let current: RangeKey = "7d"
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === "undefined") return
  loaded = true
  try {
    current = parseRange(window.sessionStorage.getItem(KEY))
  } catch {
    // storage unavailable: the default applies
  }
}

export function setDateRange(next: RangeKey) {
  current = next
  try {
    window.sessionStorage.setItem(KEY, next)
  } catch {
    // not persisted, still shared in memory
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  load()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDateRange(): [RangeKey, (next: RangeKey) => void] {
  const value = useSyncExternalStore(subscribe, () => (load(), current), () => "7d" as RangeKey)
  return [value, setDateRange]
}
