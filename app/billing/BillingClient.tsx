"use client"

import { MyPayments } from "@/components/billing/MyPayments"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { Shield, Zap, Star, AlertCircle, ArrowUpRight, CheckCircle, XCircle, Mail } from "lucide-react"
import { toast } from "sonner"
import { brand } from "@/lib/brand"


type PlanType = "trial" | "monthly" | "one_time" | "expired"

const PLAN_INFO = {
  trial: {
    label: "Free Trial",
    description: "Full access to test automations",
    color: "text-blue-400",
    icon: Zap,
  },
  monthly: {
    label: "Monthly Pro",
    description: "Unlimited access, billed monthly",
    color: "text-green-400",
    icon: Zap,
  },
  one_time: {
    label: "Lifetime Access",
    description: "Pay once, own forever",
    color: "text-[#e5a93c]",
    icon: Star,
  },
  expired: {
    label: "Expired",
    description: "Automations paused",
    color: "text-red-400",
    icon: AlertCircle,
  },
}

export default function BillingPage() {
  let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null
  let configError = false
  try {
    supabase = getSupabaseBrowserClient()
  } catch {
    configError = true
  }
  const router = useRouter()

  const [user, setUser] = useState<{ id: string; username: string; plan: string; trial_ends_at: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<"monthly" | "one_time" | null>(null)
  
  useEffect(() => {
    if (!supabase) return
    async function loadUser() {
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session) {
        router.push("/login")
        return
      }

      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = await res.json()
      if (data.authenticated) {
        setUser({
          id: data.userId || data.accountId,
          username: data.username || "user",
          plan: data.plan || "trial",
          trial_ends_at: data.trial_ends_at || null,
        })
      }
      setLoading(false)
    }

    loadUser()
  }, [supabase, router])

  const trialDaysLeft = () => {
    if (!user?.trial_ends_at || user.plan !== "trial") return 0
    const diff = new Date(user.trial_ends_at).getTime() - new Date().getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  if (configError || !supabase) {
    return (
      <div className="min-h-screen bg-[#03010A] flex items-center justify-center px-6">
        <p className="font-mono text-sm text-neutral-400 text-center">Billing is unavailable until the Supabase environment variables are set.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#03010A] flex items-center justify-center">
        <div className="font-mono text-neutral-500">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  const planInfo = PLAN_INFO[user.plan as keyof typeof PLAN_INFO] || PLAN_INFO.expired
  const PlanIcon = planInfo.icon
  const daysLeft = trialDaysLeft()

  return (
    <div className="min-h-screen bg-[#03010A] text-[#ededed] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#e5a93c]/5 via-transparent to-transparent opacity-20 pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <button onClick={() => router.push("/dashboard")} className="font-mono text-xs text-neutral-500 hover:text-white mb-8 flex items-center gap-2 transition-colors">
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Billing & Plans</h1>
          <p className="text-neutral-500 font-mono text-sm">@{user.username}</p>
        </div>

        <div className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.02] mb-8">
          <p className="font-mono text-xs text-neutral-500 uppercase tracking-wider mb-4">Current Plan</p>
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl border border-white/10 ${planInfo.color} bg-white/[0.03]`}>
              <PlanIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`font-mono text-2xl font-bold ${planInfo.color}`}>{planInfo.label}</h2>
              <p className="font-mono text-xs text-neutral-500">{planInfo.description}</p>
            </div>
          </div>

          {user.plan === "trial" && (
            <div className={`mt-4 p-4 rounded-xl border ${daysLeft <= 1 ? "border-red-500/30 bg-red-500/10" : "border-blue-500/30 bg-blue-500/10"}`}>
              <p className={`font-mono text-sm font-bold ${daysLeft <= 1 ? "text-red-400" : "text-blue-400"}`}>
                {daysLeft <= 0 ? "Trial expired!" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining in your trial`}
              </p>
              <p className="font-mono text-xs text-neutral-500 mt-1">Upgrade before your trial ends to keep your automations running.</p>
            </div>
          )}
        </div>

        <MyPayments />

        {(user.plan === "trial" || user.plan === "expired") && (
          <div className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.02] mb-8 space-y-4">
            <p className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Upgrade your plan</p>
            <p className="text-sm text-neutral-400">
              Pay from any Egyptian e-wallet (Vodafone Cash, Etisalat Cash, Orange Cash and others) or InstaPay,
              then upload the transfer screenshot. Your plan is activated after we review it.
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-[#e5a93c] hover:bg-[#d4952b] text-black font-mono text-sm font-bold py-3 px-6 rounded-xl transition-colors"
            >
              <Zap className="w-4 h-4" />
              Choose a plan
            </a>
          </div>
        )}

        {(user.plan === "monthly" || user.plan === "one_time") && (
          <div className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.02] flex items-center gap-4">
            <Shield className="w-8 h-8 text-green-400 flex-shrink-0" />
            <div>
              <h3 className="font-mono text-lg font-bold text-white mb-1">You're all set!</h3>
              <p className="font-mono text-xs text-neutral-500">
                Your automations are running with full access. 
                {user.plan === "monthly" && " To manage your subscription, contact support."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
