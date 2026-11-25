"use client"

import { useSyncExternalStore, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"

export interface SessionState {
    username: string | null
    accountId: string | null
    userId: string | null
    profilePic: string | null
    plan: string | null
    trialEndsAt: string | null
    trialGraceEndsAt: string | null
    trialExempt: boolean
    email: string | null
    role: string | null
    hasValidPayment: boolean
    isTrialExpired: boolean
    isPastDeadline: boolean
    isLoading: boolean
    isBanned: boolean
    bannedReason: string | null
    instagramReconnectRequired: boolean
    onboardingRequired: boolean
    onboardingStatus: string | null
}

/**
 * Module-level singleton session store.
 *
 * Previously every page and the dashboard layout each called useInstagramSession(),
 * which started isLoading=true and fired its own /api/auth/me request on every
 * navigation. That caused duplicate network calls and a blocking full-screen
 * spinner on every route change inside /dashboard.
 *
 * Now the session is fetched exactly once and shared across the layout and all
 * pages, so navigating between dashboard routes no longer re-fetches or
 * re-shows the loading gate.
 */
const initialState: SessionState = {
    username: null,
    accountId: null,
    userId: null,
    profilePic: null,
    plan: null,
    trialEndsAt: null,
    trialGraceEndsAt: null,
    trialExempt: false,
    email: null,
    role: null,
    hasValidPayment: false,
    isTrialExpired: false,
    isPastDeadline: false,
    isLoading: true,
    isBanned: false,
    bannedReason: null,
    instagramReconnectRequired: false,
    onboardingRequired: false,
    onboardingStatus: null,
}

let snapshot: SessionState = { ...initialState }
const listeners = new Set<() => void>()
let started = false

function setSnapshot(patch: Partial<SessionState>) {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

function getSnapshot() {
    return snapshot
}

// Required so server-rendered content has a stable snapshot to render.
// During SSR the session is never known, so we always render the initial
// (isLoading: true) state and let hydration + effects resolve the real one.
function getServerSnapshot() {
    return initialState
}

async function fetchMe(): Promise<boolean> {
    try {
        const res = await fetch("/api/auth/me", { 
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Pragma": "no-cache",
                "Cache-Control": "no-cache"
            }
        })
        if (res.ok) {
            const data = await res.json()
            if (data.authenticated) {
                setSnapshot({
                    accountId: data.accountId,
                    userId: data.userId,
                    username: data.username,
                    profilePic: data.profilePic || null,
                    plan: data.plan || null,
                    trialEndsAt: data.trial_ends_at || null,
                    trialGraceEndsAt: data.trial_grace_ends_at || null,
                    trialExempt: data.trial_exempt || false,
                    email: data.email || null,
                    role: data.role || null,
                    hasValidPayment: data.has_valid_payment || false,
                    isTrialExpired: data.is_trial_expired || false,
                    isPastDeadline: data.is_past_deadline || false,
                    isBanned: data.is_banned || false,
                    bannedReason: data.banned_reason || null,
                    instagramReconnectRequired: data.instagram_reconnect_required || false,
                    onboardingRequired: data.onboarding_required || false,
                    onboardingStatus: data.onboarding_status || null,
                })
                try {
                    localStorage.setItem("ig_account_id", data.accountId)
                    if (data.userId) localStorage.setItem("ig_user_id", data.userId)
                    localStorage.setItem("ig_username", data.username)
                    if (data.profilePic) localStorage.setItem("ig_profile_pic", data.profilePic)
                } catch {
                    // localStorage unavailable - non-fatal
                }
                return true
            }
        }
    } catch (err) {
        console.error("Failed to fetch session:", err)
    }
    return false
}

/**
 * Initialize the singleton exactly once per page session, regardless of how
 * many components (layout + pages) mount it simultaneously.
 */
function initSession(igOauth: boolean, router: ReturnType<typeof useRouter>) {
    if (started) return
    started = true

    // CASE A: Instagram redirected back with a verified OAuth code in an httpOnly cookie.
    if (igOauth) {
        ;(async () => {
            try {
                const res = await fetch("/api/instagram/callback", {
                    method: "POST",
                    credentials: "same-origin",
                })
                const data = await res.json()

                if (data.success) {
                    try {
                        if (data.userId) localStorage.setItem("ig_user_id", data.userId)
                        localStorage.setItem("ig_username", data.username)
                        if (data.profilePic) localStorage.setItem("ig_profile_pic", data.profilePic)
                    } catch {
                        // localStorage unavailable - non-fatal
                    }
                }
            } catch (err) {
                console.error("Login failed:", err)
            } finally {
                // ALWAYS fetch the full session so accountId is populated before finishing load
                await fetchMe()
                setSnapshot({ isLoading: false })
                router.replace("/dashboard")
            }
        })()
        return
    }

    // CASE B: Restore session — first show cached data, then verify with server
    try {
        const savedAccountId = localStorage.getItem("ig_account_id")
        const savedId = localStorage.getItem("ig_user_id")
        const savedName = localStorage.getItem("ig_username")
        setSnapshot({
            accountId: savedAccountId,
            userId: savedId,
            username: savedName,
            profilePic: localStorage.getItem("ig_profile_pic"),
            ...(savedAccountId ? { isLoading: false } : {}),
        })
    } catch {
        // localStorage unavailable - non-fatal
    }

    fetchMe().then((valid) => {
        if (!valid) {
            try {
                localStorage.removeItem("ig_account_id")
                localStorage.removeItem("ig_user_id")
                // We preserve ig_username and ig_profile_pic so avatar remains visible when logged out
            } catch {
                // localStorage unavailable - non-fatal
            }
            // Preserve username and profilePic in state to keep the avatar visible
            setSnapshot({ accountId: null, userId: null, email: null, role: null })
        }
        setSnapshot({ isLoading: false })
    })
}

/**
 * Initializes exactly ONE realtime subscription for the whole browser tab.
 *
 * Previously every component that called useInstagramSession() opened its own
 * pair of Supabase channels (accounts + users), so a dashboard page with the
 * layout + two pages sharing the hook held 4-6 websocket channels. That wasted
 * memory and slowed the app down. Now we keep a single global subscription and
 * refresh the shared snapshot when the account/user row changes.
 */
let realtimeStarted = false
let realtimeCleanup: (() => void) | null = null

function startRealtime(accountId: string, userId: string | null) {
    if (realtimeStarted) return
    realtimeStarted = true

    const supabase = getSupabaseBrowserClient()

    const accountChannel = supabase
        .channel(`session-acc-${accountId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'accounts', filter: `id=eq.${accountId}` },
            () => { fetchMe() }
        )
        .subscribe()

    let userChannel: any = null
    if (userId) {
        userChannel = supabase
            .channel(`session-user-${userId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
                () => { fetchMe() }
            )
            .subscribe()
    }

    realtimeCleanup = () => {
        supabase.removeChannel(accountChannel)
        if (userChannel) supabase.removeChannel(userChannel)
        realtimeStarted = false
        realtimeCleanup = null
    }
}

export function useInstagramSession() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    useEffect(() => {
        initSession(searchParams.get("ig_oauth") === "1", router)
    }, [searchParams, router])

    // Single global realtime subscription (shared by every component using this
    // hook) — replaces the old per-component channel setup that leaked sockets.
    useEffect(() => {
        if (!state.accountId) return
        startRealtime(state.accountId, state.userId)

        return () => {
            // Only tear down on real unmount of the app shell (rare); keep the
            // subscription alive across dashboard route changes.
        }
    }, [state.accountId, state.userId])

    const logout = async () => {
        // Tear down the global realtime subscription so a subsequent login
        // starts fresh channels for the new account.
        try {
            if (realtimeCleanup) realtimeCleanup()
        } catch {
            // non-fatal
        }
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
        } catch (e) {
            console.error("Logout API failed:", e)
        }
        try {
            localStorage.removeItem("ig_account_id")
            localStorage.removeItem("ig_user_id")
            // We preserve ig_username and ig_profile_pic as requested so the avatar remains visible
            // localStorage.removeItem("ig_username")
            // localStorage.removeItem("ig_profile_pic")
        } catch {
            // localStorage unavailable - non-fatal
        }
        setSnapshot({
            accountId: null,
            userId: null,
            email: null,
            role: null,
            instagramReconnectRequired: false,
            // We intentionally leave username and profilePic out of this patch
            // so they retain their last known values in the UI
        })
        router.push("/login")
    }

    return {
        ...state,
        logout,
    }
}