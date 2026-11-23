import { getSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import CheckoutClient, { type CheckoutData } from "./CheckoutClient"
import BackToHome from "@/components/ui/back-to-home"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { checkoutTerms, newReferenceCode, QUOTE_TTL_MS, signQuote } from "@/lib/billing/manual-payments"
import { paymentDestinations } from "@/lib/billing/payment-methods"
import { brand } from "@/lib/brand"
import { headers } from "next/headers"
import { isEgyptianCustomer } from "@/lib/billing/region"
import { variantForPlan, whopConfig } from "@/lib/billing/whop"
import WhopCardOption from "./WhopCardOption"

export const dynamic = "force-dynamic"

export default async function CheckoutPage(props: {
  params: Promise<{ plan_id: string }>
  searchParams: Promise<{ cycle?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const cycle = searchParams.cycle === "yearly" ? "yearly" : undefined
  const user = await getSessionUser()
  if (!user) {
    redirect(`/signup?plan_id=${encodeURIComponent(params.plan_id)}${cycle ? "&cycle=yearly" : ""}`)
  }

  const supabase = await getSupabaseBypassClient()
  const { data: plan } = /^[0-9a-f-]{36}$/i.test(params.plan_id)
    ? await supabase.from("plans").select("*").eq("id", params.plan_id).eq("is_active", true).maybeSingle()
    : { data: null }

  if (!plan || plan.is_contact_sales) {
    return <div className="p-12 text-center text-white">Plan not found.</div>
  }

  // Amount, plan and reference are decided here and signed, so the browser
  // can't change them before submitting the proof.
  const terms = checkoutTerms(plan, cycle)
  // Card (Whop) for everyone; wallet / InstaPay only for Egyptian customers
  // (the manual payment API enforces the same rule).
  const egyptian = isEgyptianCustomer({ accountCountry: user.country, headers: await headers() })
  const whopAvailable = Boolean(whopConfig() && variantForPlan(plan, cycle))
  const usd = cycle === "yearly" ? plan.price_yearly : plan.price_usd
  const cardPrice = usd != null && Number(usd) > 0 ? `$${Number(usd).toLocaleString("en-US")}` : null
  const { quote, referenceCode } = egyptian ? issueQuote(user.id, plan.id, terms) : { quote: null, referenceCode: null }

  const destinations = paymentDestinations()
  const data: CheckoutData = {
    planName: plan.name,
    interval: terms.interval,
    amountEgp: quote ? terms.amountEgp : null,
    referenceCode: quote ? referenceCode : null,
    quote,
    walletNumber: destinations.wallet?.local ?? null,
    walletInternational: destinations.wallet?.international ?? null,
    instapayNumber: destinations.instapay?.local ?? null,
    instapayInternational: destinations.instapay?.international ?? null,
    supportEmail: brand.supportEmail,
    supportWhatsapp: brand.whatsappSupport || null,
  }

  return (
    <div className="min-h-screen bg-[#03010A] text-white py-24 px-6 relative overflow-hidden">
      <FrontBackground />
      <BackToHome />
      <div className="max-w-xl mx-auto space-y-8 relative z-10">
        <WhopCardOption
          planId={plan.id}
          cycle={cycle}
          planName={plan.name}
          priceText={cardPrice}
          available={whopAvailable}
        />
        {egyptian && (
          <>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-500">
              <span className="h-px flex-1 bg-white/10" />
              Egyptian payment (wallet / InstaPay)
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <CheckoutClient data={data} />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Signs the checkout quote (amount, plan, reference, expiry). Kept outside the
 * page component: it reads the clock and randomness, which render code should not.
 */
function issueQuote(
  accountId: string,
  planId: string,
  terms: ReturnType<typeof checkoutTerms>,
): { quote: string | null; referenceCode: string | null } {
  if (!terms.amountEgp) return { quote: null, referenceCode: null }
  const referenceCode = newReferenceCode()
  try {
    const quote = signQuote({
      v: 1,
      account: accountId,
      plan: planId,
      catalog: terms.catalogPlanId,
      interval: terms.interval,
      amountEgp: terms.amountEgp,
      ref: referenceCode,
      exp: Date.now() + QUOTE_TTL_MS,
    })
    return { quote, referenceCode }
  } catch {
    return { quote: null, referenceCode: null }
  }
}
