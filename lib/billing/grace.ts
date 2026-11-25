import { TRIAL_GRACE_MS, normalizeGraceHours } from "@/lib/billing/plans"

export const GRACE_SETTING_KEY = "trial_grace_hours"

/** The grace window after a trial, in hours, as the admin set it (default 12 when unset or unreadable). */
export async function loadGraceHours(supabase: any): Promise<number> {
  try {
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", GRACE_SETTING_KEY).maybeSingle()
    if (error || !data) return normalizeGraceHours(undefined)
    const raw = data.value
    return normalizeGraceHours(raw && typeof raw === "object" ? (raw as any).hours : raw)
  } catch {
    return normalizeGraceHours(undefined)
  }
}

export async function loadGraceMs(supabase: any): Promise<number> {
  const hours = await loadGraceHours(supabase)
  return Number.isFinite(hours) ? hours * 3_600_000 : TRIAL_GRACE_MS
}
