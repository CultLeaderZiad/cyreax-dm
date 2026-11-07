export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { getSupabaseBypassClient } from "@/lib/supabase-server"

const SIGNED_URL_SECONDS = 120

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request)
  if (result.response) {
    return result.response
  }

  const supabase = await getSupabaseBypassClient()
  const { searchParams } = new URL(request.url)
  const requested = searchParams.get("status") || "pending"
  const status = ["pending", "approved", "rejected"].includes(requested) ? requested : "pending"

  try {
    const { data: payments, error } = await supabase
      .from("payment_submissions")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: "Could not load payments" }, { status: 500 })
    }

    const rows = payments || []
    const accountIds = [...new Set(rows.map((row: any) => row.account_id).filter(Boolean))]
    const userIds = [...new Set(rows.filter((row: any) => !row.account_id).map((row: any) => row.user_id))]
    const planIds = [...new Set(rows.map((row: any) => row.plan_id).filter(Boolean))]
    const [accounts, users, plans] = await Promise.all([
      accountIds.length ? supabase.from("accounts").select("id, email, plan").in("id", accountIds) : { data: [] },
      userIds.length ? supabase.from("users").select("id, username, account_id").in("id", userIds) : { data: [] },
      planIds.length ? supabase.from("plans").select("id, name").in("id", planIds) : { data: [] },
    ])
    const legacyAccountIds = [...new Set((users.data || []).map((u: any) => u.account_id).filter(Boolean))]
    const legacyAccounts = legacyAccountIds.length
      ? (await supabase.from("accounts").select("id, email, plan").in("id", legacyAccountIds)).data || []
      : []
    const accountById = new Map([...(accounts.data || []), ...legacyAccounts].map((a: any) => [a.id, a]))
    const userById = new Map((users.data || []).map((u: any) => [String(u.id), u]))
    const planById = new Map((plans.data || []).map((p: any) => [p.id, p]))

    const mapped = await Promise.all(
      rows.map(async (payment: any) => {
        const { note, proof_note, ...rest } = payment
        const legacyUser = userById.get(String(payment.user_id))
        const acct = accountById.get(payment.account_id || legacyUser?.account_id)
        let proofUrl: string | null = null
        if (payment.proof_path) {
          // Short-lived link, created per admin request. Never stored or logged.
          const signed = await supabase.storage.from("payment-proofs").createSignedUrl(payment.proof_path, SIGNED_URL_SECONDS)
          proofUrl = signed.data?.signedUrl || null
        }
        return {
          ...rest,
          note: proof_note ?? note ?? null,
          plan_name: planById.get(payment.plan_id)?.name ?? null,
          proof_url: proofUrl,
          accounts: acct ? { email: acct.email, plan: acct.plan } : null,
          users: legacyUser ? { username: legacyUser.username, plan: acct?.plan ?? null } : null,
        }
      }),
    )

    return NextResponse.json({ payments: mapped })
  } catch {
    return NextResponse.json({ error: "Could not load payments" }, { status: 500 })
  }
}
