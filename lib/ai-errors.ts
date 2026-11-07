import { NextResponse } from "next/server"

/**
 * One customer-facing message per AI failure kind. Provider error bodies
 * (which can include request ids or key hints) are never passed through.
 * generateCompletion already retries and falls back across providers, so
 * these only appear when every option is exhausted.
 */
export function aiErrorResponse(error: any): NextResponse | null {
  if (error?.name === "GroqRateLimitError") {
    const daily = /today/i.test(String(error.message))
    return NextResponse.json(
      {
        error: daily
          ? "You've used today's AI allowance for this account. It resets at midnight UTC."
          : "AI is handling a lot of requests right now. Please try again in a few seconds.",
        retryable: !daily,
      },
      { status: 429, headers: daily ? undefined : { "Retry-After": "5" } },
    )
  }
  if (error?.name === "GroqAPIError") {
    return NextResponse.json(
      { error: "The AI service is busy. Please try again shortly.", retryable: true },
      { status: 503, headers: { "Retry-After": "5" } },
    )
  }
  return null
}
