import { getSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import CheckoutClient, { type CheckoutData } from "./CheckoutClient"
import BackToHome from "@/components/ui/back-to-home"
import { FrontBackground } from "@/components/layout/FrontBackground"
import { checkoutTerms, newReferenceCode, QUOTE_TTL_MS, signQuote } from "@/lib/billing/manual-payments"
import { paymentDestinations } from "@/lib/billing/payment-methods"
import { brand } from "@/lib/brand"

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
  let quote: string | null = null
  let referenceCode: string | null = null
  if (terms.amountEgp) {
    referenceCode = newReferenceCode()
    try {
      quote = signQuote({
        v: 1,
        account: user.id,
        plan: plan.id,
        catalog: terms.catalogPlanId,
        interval: terms.interval,
        amountEgp: terms.amountEgp,
        ref: referenceCode,
        exp: Date.now() + QUOTE_TTL_MS,
      })
    } catch {
      quote = null
    }
  }

  const destinations = paymentDestinations()
  const data: CheckoutData = {
    planName: plan.name,
    interval: terms.interval,
    amountEgp: quote ? terms.amountEgp : null,
    referenceCode: quote ? referenceCode : null,
    quote,
    walletNumber: destinations.wallet.local,
    walletInternational: destinations.wallet.international,
    instapayNumber: destinations.instapay.local,
    instapayInternational: destinations.instapay.international,
    supportEmail: brand.supportEmail,
    supportWhatsapp: brand.whatsappSupport || null,
  }

  return (
    <div className="min-h-screen bg-[#03010A] text-white py-24 px-6 relative overflow-hidden">
      <FrontBackground />
      <BackToHome />
      <div className="max-w-xl mx-auto space-y-8 relative z-10">
        <CheckoutClient data={data} />
      </div>
    </div>
  )
}
