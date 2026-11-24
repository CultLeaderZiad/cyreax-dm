"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { SidebarTree, IconRail, MobileTabBar, MobileDrawer } from "@/components/nav"
import { TopBar } from "@/components/layout/TopBar"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { Loader2, Menu } from "lucide-react"
import { TrialBanner } from "@/components/layout/TrialBanner"
import { UsageNotice } from "@/components/layout/UsageNotice"
import { CommandPalette } from "@/components/ui/CommandPalette"
import { BrandLogo } from "@/components/ui/BrandLogo"
import { BRAND } from "@/lib/brand"
import { PlanGate } from "@/components/billing/PlanGate"
import { PlanActivation } from "@/components/billing/PlanActivation"
import { OnboardingForm } from "@/components/onboarding/OnboardingForm"
import { OnboardingBanner } from "@/components/onboarding/OnboardingBanner"
import { PendingReview } from "@/components/onboarding/PendingReview"
import { gateReason as gateReasonFor } from "@/lib/billing/gate"

function MobileTabBarWrapper({
    username,
    email,
    plan,
    userRole,
    onLogout,
}: {
    username?: string
    email?: string | null
    plan?: string | null
    userRole?: string | null
    onLogout?: () => void
}) {
    const pathname = usePathname()
    if (pathname?.startsWith('/dashboard/billing')) return null
    return (
        <MobileTabBar
            username={username}
            email={email}
            plan={plan}
            userRole={userRole}
            onLogout={onLogout}
        />
    )
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const {
        username,
        profilePic,
        logout,
        plan,
        trialEndsAt,
        trialExempt,
        isLoading,
        accountId,
        email,
        role,
        hasValidPayment,
        isTrialExpired,
        isPastDeadline,
        onboardingRequired,
        onboardingStatus,
        isBanned,
        bannedReason,
        instagramReconnectRequired
    } = useInstagramSession()

    const router = useRouter()
    const pathname = usePathname()
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
    // Landed here from the card checkout: confirm the payment before anything else.
    const [activating, setActivating] = useState(false)
    useEffect(() => {
        setActivating(new URLSearchParams(window.location.search).get("checkout") === "whop")
    }, [])

    useEffect(() => {
        if (typeof document !== "undefined") {
            document.title = `${BRAND.name} - ${BRAND.tagline}`
        }
    }, [])

    useEffect(() => {
        if (!isLoading) {
            if (!accountId) {
                router.replace('/login')
                return
            }
            if (role === 'admin') {
                return
            }
        }
    }, [isLoading, accountId, role, router])

    // A finished trial or subscription pauses the account: the customer picks a
    // plan and pays, or logs out. (The server blocks these accounts too.)
    const gateReason = gateReasonFor({ role, trialExempt, plan, isTrialExpired, isPastDeadline, hasValidPayment })

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--t1)]">
                <Loader2 className="size-6 animate-spin text-[var(--gold)]" />
            </div>
        )
    }

    if (!accountId) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--t1)]">
                <Loader2 className="size-6 animate-spin text-[var(--gold)]" />
            </div>
        )
    }

    if (activating && role !== 'admin') {
        return <PlanActivation />
    }

    if (onboardingRequired) {
        return <OnboardingForm />
    }

    // Details sent, waiting for the admin to approve: nothing else opens until then.
    if (onboardingStatus === 'submitted' && role !== 'admin') {
        return <PendingReview onLogout={logout} email={email} />
    }

    if (gateReason) {
        return <PlanGate reason={gateReason} onLogout={logout} email={email} />
    }

    if (isBanned) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--t1)] p-4">
                <div className="max-w-md w-full border border-[rgba(242,85,90,0.25)] bg-[var(--s1)] rounded-[12px] p-6 text-center space-y-4">
                    <div className="size-12 bg-[var(--redbg)] border border-[rgba(242,85,90,0.25)] rounded-full flex items-center justify-center mx-auto text-[var(--red)]">
                        <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    
                    <div className="space-y-1">
                        <h2 className="text-[18px] font-semibold text-[var(--t1)]">Access suspended</h2>
                        <p className="text-[13px] text-[var(--t2)]">
                            Your account has been administrative banned.
                        </p>
                    </div>

                    {bannedReason && (
                        <div className="bg-[var(--s2)] border border-[var(--line2)] rounded-[8px] p-3 text-start">
                            <span className="text-[11px] font-mono text-[var(--red)] block mb-1">Reason:</span>
                            <p className="text-[12px] text-[var(--t2)] font-mono">{bannedReason}</p>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={logout}
                            className="w-full bg-[var(--redbg)] border border-[rgba(242,85,90,0.25)] hover:bg-red-500/20 text-[var(--red)] text-[12.5px] font-medium py-2 rounded-[6px] transition-colors cursor-pointer"
                        >
                            Log out of account
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-[100dvh] text-[var(--t1)]">
            {/* ⌘K Command Palette (global) */}
            <CommandPalette />

            {/* Tablet Icon Rail (64px fixed: 768px - 1023px) */}
            <div className="hidden md:flex lg:hidden w-[64px] flex-col fixed inset-y-0 start-0 z-40">
                <IconRail
                    className="h-full w-[64px]"
                    username={username || "Workspace owner"}
                    email={email}
                    userRole={role}
                    plan={plan}
                    onLogout={logout}
                />
            </div>

            {/* Desktop SidebarTree (260px fixed: ≥1024px) */}
            <div className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 lg:start-0 z-40">
                <SidebarTree
                    className="h-full w-[260px]"
                    username={username || "Workspace owner"}
                    profilePic={profilePic}
                    email={email}
                    userRole={role}
                    plan={plan}
                    onLogout={logout}
                />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col md:ps-[64px] lg:ps-[260px] min-w-0 min-h-[100dvh]">
                {/* Mobile Top Bar (52px, rendered on all pages except inbox & billing which provide dedicated mobile headers) */}
                {!pathname?.startsWith('/dashboard/inbox') && !pathname?.startsWith('/dashboard/billing') && (
                    <header className="md:hidden h-[52px] border-b border-[var(--line)] bg-[var(--s1)] flex items-center justify-between px-4 sticky top-0 z-30">
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => setMobileDrawerOpen(true)}
                                aria-label="Open navigation drawer"
                                className="w-8 h-8 rounded-[6px] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <Menu className="w-5 h-5" />
                            </button>
                            <BrandLogo variant="mark" size="sm" />
                            <span className="font-semibold text-[14px] text-[var(--t1)]">{BRAND.name}</span>
                        </div>
                    </header>
                )}

                {/* 52px Desktop Top Bar */}
                <div className="hidden md:block">
                    <TopBar workspaceName={username || "Workspace"} />
                </div>

                <main
                    id="main-content"
                    className={`flex-1 relative z-10 ${
                        pathname?.startsWith('/dashboard/inbox')
                            ? 'overflow-hidden'
                            : pathname?.startsWith('/dashboard/billing')
                            ? 'overflow-auto pb-28 md:pb-0'
                            : 'overflow-auto pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0'
                    }`}
                >
                    {!trialExempt && <TrialBanner plan={plan || ""} trialEndsAt={trialEndsAt} />}
                    <OnboardingBanner status={onboardingStatus} />
                    <UsageNotice />
                    {instagramReconnectRequired && (
                        <div className="mx-4 mt-4 md:mx-6 rounded-[8px] border border-[rgba(245,165,36,0.30)] bg-[var(--amberbg)] px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[12.5px] text-[var(--amber)]">
                                Instagram needs to be reconnected. Automations stay paused until Meta accepts a new login.
                            </p>
                            <a
                                href="/api/instagram/auth"
                                className="shrink-0 rounded-[6px] bg-[var(--amber)] px-3 py-1.5 text-[11.5px] font-semibold text-black hover:opacity-90 transition-opacity"
                            >
                                Reconnect Instagram
                            </a>
                        </div>
                    )}
                    {children}
                </main>
            </div>

            {/* Mobile Tab Bar (<768px, hidden on pages with sticky CTA like billing or chat conversation) */}
            <MobileTabBarWrapper
                username={username || "Workspace owner"}
                email={email}
                plan={plan}
                userRole={role}
                onLogout={logout}
            />

            {/* Mobile Navigation Drawer */}
            <MobileDrawer
                isOpen={mobileDrawerOpen}
                onClose={() => setMobileDrawerOpen(false)}
                username={username || "Workspace owner"}
                email={email}
                userRole={role}
                plan={plan}
                onLogout={logout}
            />
        </div>
    )
}
