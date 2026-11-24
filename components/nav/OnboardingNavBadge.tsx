"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

/** Number of new signups and submissions waiting for the admin. Shows nothing at zero. */
export function OnboardingNavBadge() {
  const { data } = useSWR<{ count?: number }>("/api/admin/onboarding/count", fetcher, { refreshInterval: 60_000, revalidateOnFocus: true })
  const count = Number(data?.count || 0)
  if (!count) return null
  return (
    <span aria-label={`${count} waiting`} className="ms-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--gold)] px-1.5 text-[10.5px] font-bold leading-[18px] text-black">
      {count > 99 ? "99+" : count}
    </span>
  )
}
