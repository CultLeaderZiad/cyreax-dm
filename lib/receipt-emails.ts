import { sendEmail } from "./email-provider"
import { getSupabaseBypassClient } from "./supabase-server"
import { BRAND } from "./brand"

/**
 * Transactional payment receipt/confirmation emails.
 * These are service notices, not marketing — no unsubscribe footer needed.
 */

const BRAND_BG = "#03010A"
const BRAND_GOLD = "#e5a93c"

function shell(title: string, bodyHtml: string): string {
  return `
  <div style="background:${BRAND_BG};padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0e0f13;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <img src="${BRAND.appUrl}${BRAND.logo.wordmarkDark}" alt="${BRAND.name}" width="120" style="display:block;border:0;" />
      </div>
      <div style="padding:28px;color:#e5e5e5;font-size:14px;line-height:1.6;">
        <h2 style="color:#ffffff;margin:0 0 16px;font-size:20px;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);color:#8a8a8a;font-size:11px;">
        This is a transactional payment notice from ${BRAND.name}. Questions? Reply to this email or reach us via ${BRAND.emails.support || BRAND.appUrl}.
      </div>
    </div>
  </div>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#9ca3af;font-size:13px;">${label}</td>
    <td style="padding:8px 0;color:#ffffff;font-size:13px;text-align:right;">${value}</td>
  </tr>`
}

function receiptTable(rows: string, total: string): string {
  return `<table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin:16px 0;">${rows}${row("<strong>Total</strong>", `<strong style="color:${BRAND_GOLD};">${total}</strong>`)}</table>`
}

export interface PaymentReceipt {
  to: string
  planName: string
  amount: number
  currency?: string
  paymentMethod: "wallet" | "instapay" | "vodafone_cash"
  transactionReference?: string
  billingPeriod?: string
  isRenewal?: boolean
}

export async function sendPaymentReceipt(opts: PaymentReceipt): Promise<boolean> {
  const currency = opts.currency || "USD"
  const methodLabel = opts.paymentMethod === "instapay" ? "InstaPay (manual)" : "E-wallet transfer (manual)"
  const refRow = opts.transactionReference
    ? row("Reference", `<span style="font-family:monospace;">${opts.transactionReference}</span>`)
    : ""
  const periodRow = opts.billingPeriod ? row(opts.isRenewal ? "Next period" : "Period", opts.billingPeriod) : ""

  const rows = [
    row("Plan", opts.planName),
    row("Payment method", methodLabel),
    refRow,
    periodRow,
  ].join("")

  const html = shell(
    opts.isRenewal ? `Your ${BRAND.name} subscription renewed` : "Payment confirmed — thank you!",
    `
    <p>Your payment was received successfully. ${opts.isRenewal ? "Your subscription has been renewed." : "Your plan is now active and your automations are running."}</p>
    ${receiptTable(rows, `${currency === "USD" ? "$" : currency + " "}${opts.amount}`)}
    <p style="color:#9ca3af;font-size:12px;">Keep this email as your receipt. You can review your plan anytime under <strong style="color:#fff;">Billing &amp; Subscription</strong> in your dashboard. Cancellation and refund terms: <a href="${BRAND.appUrl}/refund" style="color:${BRAND_GOLD};">${BRAND.short} refund policy</a>.</p>
    `
  )

  const result = await sendEmail({
    to: opts.to,
    subject: opts.isRenewal
      ? `${BRAND.name} receipt — subscription renewed ($${opts.amount})`
      : `${BRAND.name} receipt — payment confirmed ($${opts.amount})`,
    html,
  })
  if (!result.success) {
    console.error("[receipt] Failed to send payment receipt:", result.error)
  }
  return result.success
}

export async function sendManualPaymentApproved(opts: {
  to: string
  planName: string
  amount: number
  transactionReference: string
  periodEnd?: string
}): Promise<boolean> {
  const html = shell(
    "Vodafone Cash payment approved",
    `
    <p>Your manual payment has been verified and approved. Your plan is now active.</p>
    ${receiptTable(
      [
        row("Plan", opts.planName),
        row("Payment method", "Vodafone Cash (manual)"),
        row("Reference", `<span style="font-family:monospace;">${opts.transactionReference}</span>`),
        ...(opts.periodEnd ? [row("Active until", opts.periodEnd)] : []),
      ].join(""),
      `$${opts.amount}`
    )}
    <p style="color:#9ca3af;font-size:12px;">Note: manual payments do not auto-renew — we'll remind you before your period ends. Cancellation and refund terms: <a href="${BRAND.appUrl}/refund" style="color:${BRAND_GOLD};">${BRAND.short} refund policy</a>.</p>
    `
  )
  const result = await sendEmail({
    to: opts.to,
    subject: `${BRAND.name} — payment approved, plan activated ($${opts.amount})`,
    html,
  })
  if (!result.success) {
    console.error("[receipt] Failed to send approval email:", result.error)
  }
  return result.success
}

export async function sendManualPaymentRejected(opts: {
  to: string
  amount: number
  transactionReference: string
  reason?: string
}): Promise<boolean> {
  const html = shell(
    "Vodafone Cash payment could not be verified",
    `
    <p>We could not match your submitted payment to a received transfer, so the submission was rejected.</p>
    ${receiptTable(
      [
        row("Reference", `<span style="font-family:monospace;">${opts.transactionReference}</span>`),
        row("Amount expected", `$${opts.amount}`),
        ...(opts.reason ? [row("Reason", opts.reason)] : []),
      ].join(""),
      `$${opts.amount}`
    )}
    <p>If you already sent the transfer, reply to this email with your transfer screenshot and the wallet number it was sent from — we will verify it and, if it cannot be matched, the transferred amount will be <strong style="color:#fff;">refunded to the sending wallet</strong>.</p>
    `
  )
  const result = await sendEmail({
    to: opts.to,
    subject: `${BRAND.name} — action needed: payment reference could not be verified`,
    html,
  })
  if (!result.success) {
    console.error("[receipt] Failed to send rejection email:", result.error)
  }
  return result.success
}

/** Resolve the account email for a users.id (int64) row. */
export async function getEmailForUserId(userId: number | string): Promise<string | null> {
  try {
    const supabase = await getSupabaseBypassClient()
    const { data } = await supabase
      .from("users")
      .select("account_id, accounts(email)")
      .eq("id", userId)
      .maybeSingle()
    return (data as any)?.accounts?.email ?? null
  } catch (e) {
    console.error("[receipt] Failed to resolve email for user:", e)
    return null
  }
}

/** Resolve the account email for an accounts.id (UUID) row. */
export async function getEmailForAccountId(accountId: string): Promise<string | null> {
  try {
    const supabase = await getSupabaseBypassClient()
    const { data } = await supabase
      .from("accounts")
      .select("email")
      .eq("id", accountId)
      .maybeSingle()
    return data?.email ?? null
  } catch (e) {
    console.error("[receipt] Failed to resolve email for account:", e)
    return null
  }
}
