"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard"
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard"
import { PlansComparisonRow, formatEgp, type DbPlan } from "@/components/billing/PlansComparisonRow"
import { RecentPaymentsTable } from "@/components/billing/RecentPaymentsTable"
import { UsageAlertChip, PlanCard, StickyCTA } from "@/components/mobile"
import { useWorkspaceUsage } from "@/hooks/use-workspace-usage"
import { Button } from "@/components/ui/button"
import { AlertCircle, Loader2, ChevronLeft, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"

interface BillingUsageResponse {
  plan?: {
    id: string
    name: string
    audience: string
    monthlyUsd: number
    yearlyUsd: number
    blocked: boolean
    limits: Record<string, number | boolean>
  }
  /** The plans row that was bought (name and EGP prices from Admin -> Plans). */
  displayPlan?: {
    id: string
    name: string
    price_egp?: number | null
    price_yearly_egp?: number | null
    billing_cycle?: string | null
  } | null
  interval?: "month" | "year" | "lifetime" | null
  provider?: string | null
  paymentProvider?: "whop" | "manual" | null
  cancelAtPeriodEnd?: boolean
  manageUrl?: string | null
  egyptian?: boolean
  status?: "active" | "trialing" | "past_due" | "expired"
  trialEndsAt?: string | null
  periodEnd?: string | null
  scheduledPlanId?: string | null
  metrics?: Array<{
    metric: string
    used: number
    limit: number
    level: string
  }>
}

function BillingLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading billing information">
      <div className="space-y-1">
        <div className="h-6 w-32 bg-[var(--s2)] rounded-[4px]" />
        <div className="h-4 w-72 bg-[var(--s2)] rounded-[4px]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[280px] bg-[var(--s1)] border border-[var(--line)] rounded-xl" />
        <div className="h-[280px] bg-[var(--s1)] border border-[var(--line)] rounded-xl" />
      </div>

      <div className="h-[200px] bg-[var(--s1)] border border-[var(--line)] rounded-xl" />
      <div className="h-[180px] bg-[var(--s1)] border border-[var(--line)] rounded-xl" />
    </div>
  )
}

function BillingPageContent() {
  const router = useRouter()
  const [isUpgrading, setIsUpgrading] = useState(false)
  const { usage } = useWorkspaceUsage()

  // Invoices event from the TopBar
  useEffect(() => {
    const handleInvoicesOpen = () => {
      toast.info("Opening Invoices and payment receipts")
    }

    window.addEventListener("cyreax:open-invoices", handleInvoicesOpen)

    return () => {
      window.removeEventListener("cyreax:open-invoices", handleInvoicesOpen)
    }
  }, [])

  const { data, error, isLoading, mutate } = useSWR<BillingUsageResponse>(
    "/api/billing/usage",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

  // Real plans for the mobile "upgrade/renew" button.
  const { data: dbPlans } = useSWR<DbPlan[]>("/api/plans", fetcher, { revalidateOnFocus: false })

  if (isLoading) {
    return (
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <BillingLoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full flex items-center justify-center">
        <div className="max-w-md w-full rounded-xl border border-[var(--line)] bg-[var(--s1)] p-8 text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-[var(--redbg)] border border-[rgba(242,85,90,0.25)] flex items-center justify-center mx-auto text-[var(--red)]">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-[var(--t1)]">
              Couldn&apos;t load billing
            </h3>
            <p className="text-[12.5px] text-[var(--t3)]">
              We were unable to fetch your subscription status and billing information.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => mutate()}
            className="h-[30px] px-4 text-[12px] font-medium"
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // Real plan name: the plans row that was bought, else the entitlement plan.
  const planName = data?.displayPlan?.name || data?.plan?.name || "No plan"
  const status = data?.status || "active"
  const interval = data?.interval || null

  const formatDay = (value: string | null | undefined, withYear = false) => {
    if (!value) return null
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        month: "short",
        day: "numeric",
        ...(withYear ? { year: "numeric" as const } : {}),
      }).format(new Date(value))
    } catch {
      return null
    }
  }
  const formattedRenewal = formatDay(data?.periodEnd)
  const formattedTrialEnd = formatDay(data?.trialEndsAt)

  // Prices only from the plans table; no invented amounts.
  const displayPrice =
    interval === "year"
      ? formatEgp(data?.displayPlan?.price_yearly_egp)
      : formatEgp(data?.displayPlan?.price_egp)
  const priceText = displayPrice
    ? `${displayPrice}${interval === "lifetime" ? " once" : interval === "year" ? " / yr" : " / mo"}`
    : null
  const renewsText =
    interval === "lifetime"
      ? "Lifetime"
      : formattedRenewal
      ? `${status === "expired" ? "Ended" : "Renews"} ${formattedRenewal}`
      : ""

  // Mobile CTA: renew the plan you have, otherwise the first available plan.
  const plansList = Array.isArray(dbPlans) ? dbPlans.filter((p) => !p.is_contact_sales) : []
  const targetPlan =
    (data?.displayPlan && plansList.find((p) => p.id === data.displayPlan!.id)) || plansList[0] || null
  const targetPrice = targetPlan ? formatEgp(targetPlan.price_egp) : null

  const handleContinuePayment = () => {
    if (!targetPlan) {
      router.push("/pricing")
      return
    }
    setIsUpgrading(true)
    // Real plan UUID route (was the non-existent /checkout/agency).
    router.push(`/checkout/${encodeURIComponent(targetPlan.id)}`)
  }

  return (
    <>
      {/* Mobile Billing View (<768px) matching 01-billing.png */}
      <div className="md:hidden flex flex-col min-h-screen bg-[var(--bg)] text-[var(--t1)] pb-36">
        {/* Mobile Header: 52px */}
        <header className="h-[52px] px-4 flex items-center justify-between border-b border-[var(--line)] bg-[var(--s1)] sticky top-0 z-20">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--t1)] hover:text-[var(--gold)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[var(--t2)]" />
            <span>Billing</span>
          </Link>
          <div className="flex items-center gap-1 text-[13px] text-[var(--t2)] font-medium">
            <span>{usage?.workspace?.name || "Workspace"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--t3)]" />
          </div>
        </header>

        <div className="p-4 space-y-5">
          {/* Usage Alert Chip */}
          <UsageAlertChip />

          {/* CURRENT PLAN */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--t3)] font-semibold">
              CURRENT PLAN
            </h2>
            <PlanCard />
          </div>

          {/* PAYMENT: real options only (card everywhere, wallet/InstaPay in Egypt) */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--t3)] font-semibold">
              PAYMENT
            </h2>
            <div className="rounded-[12px] border border-[var(--line)] bg-[var(--s1)] p-4 space-y-2 text-[13px] text-[var(--t2)]">
              {data?.paymentProvider === "whop" ? (
                <>
                  <p>Paid by card through Whop.</p>
                  {data?.manageUrl && (
                    <a href={data.manageUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--gold2)]">
                      Manage subscription
                    </a>
                  )}
                </>
              ) : (
                <p>
                  {data?.egyptian
                    ? "Pay by card, e-wallet or InstaPay at checkout."
                    : "Pay by card at checkout."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <StickyCTA
          targetPlanTitle={
            targetPlan
              ? data?.displayPlan?.id === targetPlan.id
                ? `Renew ${targetPlan.name}`
                : `Choose ${targetPlan.name}`
              : "See plans"
          }
          priceText={targetPrice ? `${targetPrice}/mo` : ""}
          methodName={data?.egyptian ? "Card, e-wallet or InstaPay" : "Card"}
          loading={isUpgrading}
          onClick={handleContinuePayment}
        />
      </div>

      {/* Desktop Billing View (≥768px, untouched) */}
      <div className="hidden md:block flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--line2)] select-none">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
            Billing
          </h1>
          <p className="text-[12.5px] text-[var(--t3)]">
            Your plan, usage and payments.
          </p>
        </div>

        {/* Top Grid: Current Plan & Payment Method (1fr / 1fr, gap-6) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <CurrentPlanCard
            planName={planName}
            status={status}
            renewsText={renewsText}
            priceText={priceText}
            trialEndsAt={formattedTrialEnd}
            metrics={data?.metrics || []}
            periodEndLabel={formatDay(data?.periodEnd, true)}
            onCancelSubscription={() => mutate()}
            paymentProvider={data?.paymentProvider || null}
            cancelAtPeriodEnd={Boolean(data?.cancelAtPeriodEnd)}
            manageUrl={data?.manageUrl || null}
          />
          {data?.egyptian && data?.paymentProvider !== "whop" ? (
            // Egyptian customers on (or choosing) wallet / InstaPay: renew here.
            <PaymentMethodCard />
          ) : (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 space-y-3">
              <h3 className="text-[14px] font-semibold text-[var(--t1)]">Payment</h3>
              <p className="text-[12.5px] text-[var(--t2)]">
                {data?.paymentProvider === "whop"
                  ? "Your card is billed by Whop. Update the card, see receipts or cancel with Manage subscription."
                  : "Pay by card at checkout. Choose a plan below to continue."}
              </p>
              {data?.paymentProvider === "whop" && data?.manageUrl && (
                <a
                  href={data.manageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center h-[34px] px-4 rounded-[6px] bg-[var(--gold)] text-black font-semibold text-[12px] hover:bg-[var(--gold2)]"
                >
                  Manage subscription
                </a>
              )}
            </div>
          )}
        </div>

        {/* Plans Row (Full Width) */}
        <PlansComparisonRow currentPlanId={data?.displayPlan?.id || null} />

        {/* Recent Payments Table (Full Width) */}
        <RecentPaymentsTable />
      </div>
    </>
  )
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-52px)] flex items-center justify-center bg-[var(--bg)]">
          <Loader2 className="w-7 h-7 text-[var(--t3)] animate-spin" />
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  )
}
