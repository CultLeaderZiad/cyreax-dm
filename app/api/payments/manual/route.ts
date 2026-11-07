// Plan payments by Egyptian e-wallet or InstaPay transfer, with proof.
//
// POST (multipart/form-data): quote, method, senderRef, amountPaid,
//   transactionRef, transferredAt, proof (png/jpg/webp <= 5 MB)
// GET: the caller's own payments and their review status.
//
// The amount, plan and reference code come from a quote the checkout page
// signed for this account, never from the form. Nothing here activates a
// plan: rows start 'pending' and only cyreax_review_payment (admin) changes them.
export const dynamic = "force-dynamic"

import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { forbidBelow, requireSessionUser } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { ensureTenantProfile } from "@/lib/tenant-user"
import { takeRateSlots } from "@/lib/rate-limit"
import {
  MAX_PENDING_PER_ACCOUNT,
  PROOF_MAX_BYTES,
  SUBMISSIONS_PER_HOUR,
  customerStatus,
  proofObjectPath,
  validateProofFile,
  validateSubmission,
  verifyQuote,
} from "@/lib/billing/manual-payments"
import { notifyAdminsOfPayment } from "@/lib/billing/payment-notify"

const BUCKET = "payment-proofs"

function fail(status: number, error: string, field?: string) {
  return NextResponse.json({ error, field }, { status })
}

export async function POST(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const denied = forbidBelow(session.user.workspace_role, "owner")
  if (denied) return denied
  const account = session.user

  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > PROOF_MAX_BYTES + 256 * 1024) return fail(413, "The screenshot must be 5 MB or smaller.", "proof")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, "Send the form as multipart/form-data.")
  }

  let quote
  try {
    quote = verifyQuote(String(form.get("quote") || ""), account.id)
  } catch {
    return fail(503, "Payments are not configured yet. Please contact support.")
  }
  if (!quote) return fail(400, "This checkout expired. Reload the page and try again.", "quote")

  const parsed = validateSubmission({
    method: form.get("method"),
    senderRef: form.get("senderRef"),
    amountPaid: form.get("amountPaid"),
    transactionRef: form.get("transactionRef"),
    transferredAt: form.get("transferredAt"),
  })
  if (!parsed.ok) return fail(400, parsed.error, parsed.field)

  const file = form.get("proof")
  const proofFile = file && typeof file === "object" && "arrayBuffer" in file ? (file as File) : null
  if (proofFile && proofFile.size > PROOF_MAX_BYTES) return fail(400, "The screenshot must be 5 MB or smaller.", "proof")
  const bytes = proofFile ? new Uint8Array(await proofFile.arrayBuffer()) : null
  const proof = validateProofFile(proofFile, bytes)
  if (!proof.ok) return fail(400, proof.error, proof.field)

  const supabase = await getSupabaseBypassClient()

  const allowed = await takeRateSlots(supabase, [
    { key: `abuse:payment-proof:account:${account.id}`, limit: SUBMISSIONS_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!allowed) return fail(429, "Too many payment submissions. Please wait an hour or contact support.")

  const pending = await supabase
    .from("payment_submissions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("status", "pending")
  if (pending.error) return fail(503, "Payments are not available yet. Please contact support.")
  if ((pending.count || 0) >= MAX_PENDING_PER_ACCOUNT) {
    return fail(429, "You already have payments under review. Wait for them to be reviewed or contact support.")
  }

  const v = parsed.value
  const duplicate = await supabase
    .from("payment_submissions")
    .select("id")
    .eq("payment_method", v.method)
    .eq("transaction_reference", v.transactionRef)
    .limit(1)
  if (duplicate.data?.length) return fail(409, "This transaction number was already submitted.", "transactionRef")

  let sanitized
  try {
    const { sanitizeProofImage } = await import("@/lib/billing/proof-image")
    sanitized = await sanitizeProofImage(bytes!, proof.value)
  } catch {
    return fail(400, "That file is not a readable PNG, JPG or WebP image.", "proof")
  }

  let profileId = session.igUser?.id
  if (!profileId) {
    try {
      profileId = (await ensureTenantProfile(supabase, account, "workspace_managed", session.workspace?.id)).id
    } catch {
      return fail(500, "Could not prepare your account. Please contact support.")
    }
  }

  const paymentId = randomUUID()
  const path = proofObjectPath(account.id, paymentId, sanitized.ext)
  const uploaded = await supabase.storage.from(BUCKET).upload(path, sanitized.bytes, {
    contentType: sanitized.contentType,
    upsert: false,
  })
  if (uploaded.error) {
    console.error("[payments/manual] proof upload failed:", uploaded.error.message)
    return fail(503, "Could not store the screenshot. Please try again.")
  }

  const { data: planRow } = await supabase.from("plans").select("name").eq("id", quote.plan).maybeSingle()
  const inserted = await supabase.from("payment_submissions").insert({
    id: paymentId,
    user_id: profileId,
    account_id: account.id,
    workspace_id: session.workspace?.id || null,
    plan_id: quote.plan,
    plan_slug: quote.catalog,
    interval: quote.interval,
    amount: quote.amountEgp,
    amount_egp: quote.amountEgp,
    amount_paid_egp: v.amountPaidEgp,
    payment_method: v.method,
    sender_ref: v.senderRef,
    transaction_reference: v.transactionRef,
    transferred_at: v.transferredAt,
    reference_code: quote.ref,
    proof_path: path,
    status: "pending",
  })
  if (inserted.error) {
    await supabase.storage.from(BUCKET).remove([path])
    if (inserted.error.code === "23505") {
      return fail(409, "This transaction number or checkout was already submitted.", "transactionRef")
    }
    console.error("[payments/manual] insert failed:", inserted.error.code, inserted.error.message)
    return fail(500, "Could not save the payment. Please try again.")
  }

  await supabase.from("payment_events").insert({ payment_id: paymentId, actor_account_id: account.id, action: "submitted" })
  await notifyAdminsOfPayment(supabase, {
    referenceCode: quote.ref,
    planName: planRow?.name || quote.catalog,
    amountEgp: quote.amountEgp,
    method: v.method,
  })

  return NextResponse.json({ id: paymentId, referenceCode: quote.ref, status: "under_review" }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const session = await requireSessionUser(request)
  if (session.response) return session.response
  const supabase = await getSupabaseBypassClient()
  const { data, error } = await supabase
    .from("payment_submissions")
    .select("id, created_at, plan_id, plan_slug, interval, amount_egp, payment_method, reference_code, status, admin_note, rejection_reason, period_end, reviewed_at")
    .eq("account_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ payments: [] })
  return NextResponse.json({
    payments: (data || []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      planId: row.plan_id,
      plan: row.plan_slug,
      interval: row.interval,
      amountEgp: row.amount_egp == null ? null : Number(row.amount_egp),
      method: row.payment_method,
      referenceCode: row.reference_code,
      status: customerStatus(row),
      reason: row.status === "rejected" ? row.admin_note || row.rejection_reason || null : null,
      periodEnd: row.status === "approved" ? row.period_end : null,
      reviewedAt: row.reviewed_at,
    })),
  })
}
