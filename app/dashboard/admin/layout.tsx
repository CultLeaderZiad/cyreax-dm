import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"

export default async function DashboardAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const account = await getSessionUser()

  if (!account) {
    redirect("/login")
  }

  if (account.role !== "admin" || account.is_banned) {
    redirect("/dashboard")
  }

  return <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-7">{children}</div>
}
