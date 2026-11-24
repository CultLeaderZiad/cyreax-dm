import { activePeriodValid } from "@/lib/billing/enforce";
export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSessionInstagramUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { instagramNeedsReconnect } from "@/lib/instagram-token"

/**
 * GET /api/auth/me
 * Returns the current user's identity from the server-verified session.
 * Called by the frontend on mount (since the cookie is httpOnly).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionInstagramUser(request)
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

  const { account, igUser } = session

  const userRole = account.role || "customer";
    
  // Default avatars based on role
  let defaultProfilePic = "/agency-avatar.png";
  if (userRole === "admin") {
    defaultProfilePic = "/admin-avatar.png";
  }

    let hasValidPayment = false;
    let isTrialExpired = false;
    let isPastDeadline = false;

    let effectivePlan = igUser?.plan ?? account.plan;
    let effectiveTrialEnds = igUser?.trial_ends_at ?? account.trial_ends_at;

    if (effectiveTrialEnds) {
      const trialDate = new Date(effectiveTrialEnds);
      const now = new Date();
      if (trialDate < now) {
        isTrialExpired = true;
        // 24 hour deadline after expiration
        if (now.getTime() - trialDate.getTime() > 24 * 60 * 60 * 1000) {
          isPastDeadline = true;
        }
      }
    }

    // Admin bypass
    if (userRole === "admin") {
      hasValidPayment = true;
      isTrialExpired = false;
      isPastDeadline = false;
    } else {
      const supabase = await getSupabaseBypassClient();

      // Check billing_accounts (entitlement source of truth)
      const { data: billingAccount } = await supabase
        .from("billing_accounts")
        .select("plan_id, status, interval, trial_ends_at, current_period_end")
        .eq("account_id", account.id)
        .maybeSingle();

      if (billingAccount) {
        effectivePlan = billingAccount.plan_id || effectivePlan;
        if (billingAccount.trial_ends_at) {
          effectiveTrialEnds = billingAccount.trial_ends_at;
        }

        if (billingAccount.status === "active" && !activePeriodValid(billingAccount)) {
          // Paid period is over (the dunning cron may not have run yet).
          hasValidPayment = false;
          isTrialExpired = true;
          isPastDeadline = true;
        } else if (billingAccount.status === "active") {
          hasValidPayment = true;
          isTrialExpired = false;
          isPastDeadline = false;
        } else if (billingAccount.status === "trialing") {
          if (effectiveTrialEnds) {
            const trialDate = new Date(effectiveTrialEnds);
            const now = new Date();
            if (trialDate < now) {
              isTrialExpired = true;
              if (now.getTime() - trialDate.getTime() > 24 * 60 * 60 * 1000) {
                isPastDeadline = true;
              }
            } else {
              isTrialExpired = false;
              isPastDeadline = false;
            }
          }
        } else if (billingAccount.status === "expired" || billingAccount.status === "canceled") {
          isTrialExpired = true;
          isPastDeadline = true;
        }
      }

      // Fallback to legacy payment sources if not already confirmed active
      if (!hasValidPayment && effectivePlan && effectivePlan !== "trial" && igUser) {
        const [paymentResult, subResult] = await Promise.all([
          supabase
            .from("payment_submissions")
            .select("id")
            .eq("user_id", igUser.id)
            .eq("status", "approved")
            .limit(1)
            .maybeSingle(),
          supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", igUser.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle()
        ]);

        hasValidPayment = !!(paymentResult.data || subResult.data);
      }
    }

    return NextResponse.json({
      authenticated: true,
      accountId: account.id,
      email: account.email || null,
      role: account.role || "customer",
      // The Instagram user id (int64) — this is the key for ALL business tables.
      userId: igUser?.id?.toString() || null,
      username: (account as any).full_name || igUser?.username || account.email?.split("@")[0] || "User",
      profilePic: (account as any).profile_picture_url || defaultProfilePic,
      created_at: account.created_at,
      plan: effectivePlan,
      trial_ends_at: effectiveTrialEnds,
      trial_exempt: account.trial_exempt,
      permission_level: account.permission_level,
      is_team_member: account.is_team_member,
      workspace_id: account.workspace_id || null,
      workspace_name: account.workspace_name || null,
      workspace_role: account.workspace_role || null,
      has_valid_payment: hasValidPayment,
      is_trial_expired: isTrialExpired,
      is_past_deadline: isPastDeadline,
      is_banned: account.is_banned || false,
      banned_reason: account.banned_reason || null,
      instagram_reconnect_required: instagramNeedsReconnect(igUser),
    })
  } catch (error: any) {
    console.error("[auth/me] Error:", error)
    return NextResponse.json({ authenticated: false, error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
