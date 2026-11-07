// Admin review for manual payments (e-wallet, InstaPay and older Vodafone
// Cash rows). The whole review runs inside cyreax_review_payment(): it locks
// the row, refuses anything that is not pending (so a double click or a
// retry never extends a plan twice), extends the paid period, writes the
// billing tables and the audit row, all in one transaction.
//
// PATCH /api/admin/payments/[id]  { action: "approve" | "reject", note? }
export const dynamic = "force-dynamic"
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { sendManualPaymentApproved, sendManualPaymentRejected, getEmailForUserId } from "@/lib/receipt-emails"
import { notifyCustomerOfReview } from "@/lib/billing/payment-notify"
import { BRAND } from "@/lib/brand"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin(request)
  if (result.response) return result.response

  const { id: paymentId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  const adminAccount = result.user

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const action = body?.action
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }
  const note = String(body?.note ?? body?.rejection_reason ?? "").trim().slice(0, 500) || null
  if (action === "reject" && !note) {
    return NextResponse.json({ error: "Add a reason so the customer knows what to fix." }, { status: 400 })
  }

  const supabase = await getSupabaseBypassClient()
  const { data: payment } = await supabase
    .from("payment_submissions")
    .select("id, user_id, account_id, workspace_id, plan_id, plan_slug, amount, amount_egp, transaction_reference, reference_code, status")
    .eq("id", paymentId)
    .maybeSingle()
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 })

  // Older rows have no plan slug: keep the previous mapping for them.
  let fallbackPlan: string | null = null
  if (!payment.plan_slug) {
    if (payment.plan_id) {
      const { data: plan } = await supabase.from("plans").select("billing_cycle").eq("id", payment.plan_id).maybeSingle()
      fallbackPlan = plan?.billing_cycle === "monthly" ? "creator" : "creator_plus"
    } else {
      fallbackPlan = Number(payment.amount) === 199 ? "creator_plus" : "creator"
    }
  }

  const { data: review, error } = await supabase.rpc("cyreax_review_payment", {
    p_payment_id: paymentId,
    p_action: action,
    p_admin_account: adminAccount.id,
    p_note: note,
    p_fallback_plan: fallbackPlan,
  })
  if (error) {
    console.error("[admin/payments] review failed:", error.message)
    const missing = /cyreax_review_payment|schema cache|does not exist/i.test(error.message || "")
    return NextResponse.json(
      { error: missing ? "Run the payments migration (20261107120300) first." : "Could not review the payment." },
      { status: missing ? 503 : 500 },
    )
  }

  const outcome = review?.result
  if (outcome === "not_found") return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  if (outcome === "already_reviewed") {
    return NextResponse.json({ success: true, alreadyReviewed: true, status: review.status })
  }

  const accountId: string | null = review?.account_id || payment.account_id || null
  if (accountId) {
    await notifyCustomerOfReview(supabase, {
      accountId,
      workspaceId: payment.workspace_id,
      referenceCode: payment.reference_code,
      approved: outcome === "approved",
      note,
    })
  }

  // Email notice. Non-blocking.
  try {
    const toEmail = await getEmailForUserId(payment.user_id)
    if (toEmail) {
      let planName = `${BRAND.name} Plan`
      if (payment.plan_id) {
        const { data: planRow } = await supabase.from("plans").select("name").eq("id", payment.plan_id).maybeSingle()
        planName = planRow?.name || planName
      }
      const amount = Number(payment.amount_egp ?? payment.amount)
      const reference = payment.reference_code || payment.transaction_reference
      if (outcome === "approved") {
        await sendManualPaymentApproved({
          to: toEmail,
          planName,
          amount,
          transactionReference: reference,
          periodEnd: review?.period_end ? new Date(review.period_end).toLocaleDateString("en-GB") : undefined,
        })
      } else {
        await sendManualPaymentRejected({ to: toEmail, amount, transactionReference: reference, reason: note || undefined })
      }
    }
  } catch (e: any) {
    console.error("[admin/payments] notice email failed (non-blocking):", e?.message)
  }

  return NextResponse.json({ success: true, status: outcome, periodEnd: review?.period_end ?? null })
}
