import { lookup as dnsLookup } from "node:dns/promises"
import { isIP } from "node:net"
import { isSafeWebhookUrl } from "@/lib/flows/graph"

type Lookup = (host: string) => Promise<Array<{ address: string }>>

const defaultLookup: Lookup = (host) => dnsLookup(host, { all: true, verbatim: true })

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number)
  if ([a, b].some((n) => Number.isNaN(n))) return true
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return v4Private(ip)
  if (family === 6) {
    const v = ip.toLowerCase()
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return v4Private(mapped[1])
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("64:ff9b:")
  }
  return true
}

/**
 * isSafeWebhookUrl only looks at the host string, so a public name that
 * resolves to 10.x / 127.x / 169.254.x passed. This also resolves the name
 * and requires every address to be public. Any lookup error refuses.
 * (Residual: DNS rebinding between this check and the fetch.)
 */
export async function resolvesToPublicHost(url: string, lookup: Lookup = defaultLookup): Promise<boolean> {
  if (!isSafeWebhookUrl(url)) return false
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) return !isPrivateAddress(host)
  try {
    const addresses = await lookup(host)
    return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address))
  } catch {
    return false
  }
}
