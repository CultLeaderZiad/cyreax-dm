/**
 * Who may use the Egypt-only manual payment methods (e-wallet / InstaPay).
 *
 * 1. The country saved on the account (accounts.country, ISO alpha-2) wins.
 * 2. Otherwise Vercel's x-vercel-ip-country header, which Vercel's edge sets
 *    from the client IP (a client-sent value is overwritten on Vercel).
 * 3. Otherwise: not Egyptian.
 *
 * Enforced on the server (the manual payment API refuses non-EG accounts),
 * not only by hiding the option in the UI.
 */
export const EGYPT = "EG"

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(v) ? v : null
}

export function customerCountry(input: { accountCountry?: unknown; headers?: { get(name: string): string | null } | null }): {
  country: string | null
  source: "account" | "ip" | "unknown"
} {
  const saved = normalizeCountry(input.accountCountry)
  if (saved) return { country: saved, source: "account" }
  const ip = normalizeCountry(input.headers?.get("x-vercel-ip-country") ?? null)
  if (ip) return { country: ip, source: "ip" }
  return { country: null, source: "unknown" }
}

export function isEgyptianCustomer(input: Parameters<typeof customerCountry>[0]): boolean {
  return customerCountry(input).country === EGYPT
}

/** Reads accounts.country; null when the column is missing or unset. */
export async function savedCountry(supabase: any, accountId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("accounts").select("country").eq("id", accountId).maybeSingle()
    if (error) return null
    return normalizeCountry(data?.country)
  } catch {
    return null
  }
}
