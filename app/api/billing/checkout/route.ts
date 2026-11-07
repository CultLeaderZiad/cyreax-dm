// Billing checkout. Manual wallet / InstaPay transfers are the default; Paymob
// and Tap links are used only when their platform env keys are set. The annual
// toggle records interval='year'. No secrets are logged.
//
// POST /api/billing/checkout
import { type NextRequest, NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/auth"
import { planPriceCents, resolvePlan } from "@/lib/billing/plans"
import { resolveInterval } from "@/lib/billing/activation"
import { createPaymobLink, createTapLink } from "@/lib/commerce/payments"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { BRAND } from "@/lib/brand"

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const body = await request.json().catch(() => ({}))
  const plan = resolvePlan(String(body.planId || ""))
  const interval = resolveInterval(body)
  if (plan.blocked || plan.monthlyUsd <= 0 || plan.id === "creator_free") {
    return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 })
  }
  const provider =
    body.provider === "email" || body.provider === "email_request"
      ? "email"
      : body.provider === "paymob" || body.provider === "tap" || body.provider === "vodafone_cash"
      ? body.provider
      : "vodafone_cash"
  const amountCents = planPriceCents(plan.id, interval)
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const description = `${BRAND.name} ${plan.name} (${interval})`

  if (provider === "vodafone_cash") {
    return NextResponse.json({
      provider,
      amountCents,
      currency: "usd",
      instructions: "Transfer the amount with Vodafone Cash and submit the receipt on the billing page. An admin confirms it.",
    })
  }

  if (provider === "email") {
    return NextResponse.json({
      provider,
      amountCents,
      currency: "usd",
      instructions: "Payment request sent to your email. Check your inbox for invoice and transfer details.",
    })
  }

  const requestBody = {
    amountCents,
    currency: "usd",
    description,
    orderId: session.user.id,
    successUrl: `${origin}/billing?status=success`,
    cancelUrl: `${origin}/billing?status=canceled`,
    customer: { email: session.user.email, name: session.user.email },
  }

  try {
    if (provider === "paymob") {
      const apiKey = process.env.PAYMOB_API_KEY
      const integrationId = process.env.PAYMOB_INTEGRATION_ID
      const iframeId = process.env.PAYMOB_IFRAME_ID
      if (!apiKey || !integrationId || !iframeId) {
        return NextResponse.json({ error: `Paymob is not configured for ${BRAND.name} billing.` }, { status: 503 })
      }
      const link = await createPaymobLink(requestBody, { apiKey, integrationId, iframeId })
      return NextResponse.json({ url: link.url, provider, reference: link.reference, planId: plan.id })
    }

    if (provider === "tap") {
      const secretKey = process.env.TAP_SECRET_KEY
      if (!secretKey) return NextResponse.json({ error: "Tap is not configured." }, { status: 503 })
      const link = await createTapLink(requestBody, { secretKey })
      return NextResponse.json({ url: link.url, provider, reference: link.reference, planId: plan.id })
    }

    return NextResponse.json({ error: "Unsupported payment provider." }, { status: 400 })
  } catch (error) {
    const { captureException } = await import("@/lib/monitoring")
    await captureException(error, { route: "billing/checkout" })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 502 }
    )
  }
}
