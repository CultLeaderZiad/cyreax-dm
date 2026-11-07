import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** Short path for the payment review screen. Admin check happens on the server. */
export default async function AdminPaymentsShortcut() {
  const account = await getSessionUser()
  if (!account) redirect("/login")
  if (account.role !== "admin" || account.is_banned) redirect("/dashboard")
  redirect("/dashboard/admin/payments")
}
