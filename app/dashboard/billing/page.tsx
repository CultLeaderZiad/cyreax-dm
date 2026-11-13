"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard"
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard"
import { PlansComparisonRow } from "@/components/billing/PlansComparisonRow"
import { RecentPaymentsTable } from "@/components/billing/RecentPaymentsTable"
import { UsageAlertChip, PlanCard, PaymentMethodList, StickyCTA } from "@/components/mobile"
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
  const [selectedCurrency, setSelectedCurrency] = useState<"EGP" | "SAR" | "USD">("EGP")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("vodafone_cash")
  const [isUpgrading, setIsUpgrading] = useState(false)
  const { usage } = useWorkspaceUsage()

  // Listen to currency change & invoices event from TopBar
  useEffect(() => {
    const handleCurrencyChange = (e: CustomEvent<"EGP" | "SAR" | "USD">) => {
      if (e.detail) setSelectedCurrency(e.detail)
    }

    const handleInvoicesOpen = () => {
      toast.info("Opening Invoices and payment receipts")
    }

    window.addEventListener("cyreax:currency-change", handleCurrencyChange as EventListener)
    window.addEventListener("cyreax:open-invoices", handleInvoicesOpen)

    return () => {
      window.removeEventListener("cyreax:currency-change", handleCurrencyChange as EventListener)
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

  const rawPlanName = data?.plan?.name
  // Always use real plan name, never "monthly"
  const planName =
    rawPlanName && rawPlanName.toLowerCase() !== "monthly"
      ? rawPlanName
      : "Agency Growth"

  const status = data?.status || "active"

  // Format renewal date using Cairo time zone
  let formattedRenewal = "Nov 1"
  if (data?.periodEnd) {
    try {
      formattedRenewal = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        month: "short",
        day: "numeric",
      }).format(new Date(data.periodEnd))
    } catch {
      formattedRenewal = "Nov 1"
    }
  }

  let formattedTrialEnd: string | null = null
  if (data?.trialEndsAt) {
    try {
      formattedTrialEnd = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        month: "short",
        day: "numeric",
      }).format(new Date(data.trialEndsAt))
    } catch {
      formattedTrialEnd = null
    }
  }

  const renewsPrice =
    selectedCurrency === "SAR"
      ? "SAR 920"
      : selectedCurrency === "USD"
      ? "$249"
      : "EGP 11,900"

  const totalChargeAmount =
    selectedCurrency === "SAR"
      ? "SAR 1,220"
      : selectedCurrency === "USD"
      ? "$329"
      : "EGP 15,700"

  const renewsText = `Renews ${formattedRenewal} · ${renewsPrice} / mo`

  const handleContinuePayment = () => {
    setIsUpgrading(true)
    router.push(`/checkout/agency?method=${selectedPaymentMethod}`)
  }

  const selectedMethodLabel =
    selectedPaymentMethod === "vodafone_cash"
      ? "Vodafone Cash"
      : "Email payment request"

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

          {/* PAY WITH */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--t3)] font-semibold">
              PAY WITH
            </h2>
            <PaymentMethodList
              selectedId={selectedPaymentMethod}
              onSelect={setSelectedPaymentMethod}
            />
          </div>
        </div>

        {/* Sticky CTA */}
        <StickyCTA
          targetPlanTitle="Upgrade to Agency"
          priceText="EGP 3,900/mo"
          methodName={selectedMethodLabel}
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
            One subscription for the agency. Pay by Vodafone Cash or email payment request.
          </p>
        </div>

        {/* Top Grid: Current Plan & Payment Method (1fr / 1fr, gap-6) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <CurrentPlanCard
            planName={planName}
            status={status}
            renewsText={renewsText}
            trialEndsAt={formattedTrialEnd}
            currency={selectedCurrency}
            onCancelSubscription={() => mutate()}
          />
          <PaymentMethodCard
            amount={totalChargeAmount}
            currency={selectedCurrency}
            currentPlanId={data?.plan?.id || "agency"}
          />
        </div>

        {/* Plans Row (Full Width) */}
        <PlansComparisonRow
          currency={selectedCurrency}
          currentPlanId="agency-growth"
        />

        {/* Recent Payments Table (Full Width) */}
        <RecentPaymentsTable currency={selectedCurrency} />
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
