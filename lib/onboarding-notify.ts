import { sendEmail } from "@/lib/email-provider"
import { BRAND } from "@/lib/brand"

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

/**
 * Tells the admin a new customer submitted their details, so the accounts can be
 * connected by hand. Best effort: the admin page and its badge are the source of
 * truth, so a mail failure never fails the customer's request. The email holds
 * no token or other secret, only who it is and where to look.
 */
export async function notifyAdminOfOnboarding(input: { name: string; company: string | null; email: string | null }): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL || BRAND.emails.support
  if (!to) return
  try {
    await sendEmail({
      to,
      subject: `New customer to connect: ${input.name.slice(0, 80)}`,
      html: `<p><strong>${esc(input.name)}</strong>${input.company ? ` (${esc(input.company)})` : ""}${input.email ? `, ${esc(input.email)}` : ""} submitted their account details.</p><p>Open <strong>Admin &rarr; Onboarding</strong> to connect their accounts and send the access link.</p>`,
    })
  } catch {
    // ignored on purpose, see above
  }
}
