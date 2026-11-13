import type { FetchLike, SendOutcome } from "@/lib/channels/types"

/**
 * Graph error codes that mean "throttled, nothing was sent": app/page/user
 * rate limits (4, 17, 32, 613), Messenger/IG business-use-case limits
 * (80001-80009) and WhatsApp throughput/pair-rate (130429, 131056).
 * Only these are retried, so a retry can never double-send.
 */
const THROTTLE_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 130429, 131056])

export function isThrottled(status: number, json: any): boolean {
  if (status === 429) return true
  const code = Number(json?.error?.code)
  return THROTTLE_CODES.has(code)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  options: { retries?: number; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const retries = options.retries ?? 2
  const wait = options.wait ?? sleep
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
    let json: any = null
    try {
      json = await response.json()
    } catch {
      json = null
    }
    if (attempt < retries && isThrottled(response.status, json)) {
      // Short, jittered backoff: serverless time is limited, and the inbound
      // worker re-queues anything still throttled after this.
      await wait(400 * 3 ** attempt + Math.floor(Math.random() * 200))
      continue
    }
    return { ok: response.ok, status: response.status, json }
  }
}

export function graphOutcome(json: any, id?: string): SendOutcome {
  if (json?.error) {
    const code = typeof json.error.code === "number" ? json.error.code : undefined
    const message = typeof json.error.message === "string" ? json.error.message : JSON.stringify(json.error)
    return {
      ok: false,
      code,
      error: code === 131047 ? "OUTSIDE_WINDOW" : message,
      outsideWindow: code === 131047,
    }
  }
  return { ok: true, id: id || json?.id || json?.message_id }
}

export function defaultFetch(): FetchLike {
  return (input, init) => fetch(input, init)
}
