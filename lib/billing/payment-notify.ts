/**
 * In-app notices for manual payments, through the existing notifications
 * table and bell. No new vendor. Bodies never include phone numbers,
 * wallet ids or screenshot URLs.
 */
type Db = any

async function ownedWorkspace(supabase: Db, accountId: string): Promise<string | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
  return data?.[0]?.id ?? null
}

/** The bell lists by workspace when the viewer has one, so target it. */
async function insertNotice(supabase: Db, accountId: string, workspaceId: string | null, notice: { title: string; body: string; link: string }) {
  const { error } = await supabase.from("notifications").insert({
    account_id: accountId,
    workspace_id: workspaceId,
    kind: "payment",
    title: notice.title.slice(0, 200),
    body: notice.body.slice(0, 500),
    link: notice.link,
  })
  if (error) console.warn("[payment-notify] notification insert failed:", error.message)
}

export async function notifyAdminsOfPayment(supabase: Db, payment: { referenceCode: string; planName: string; amountEgp: number; method: string }) {
  try {
    const { data: admins } = await supabase.from("accounts").select("id").eq("role", "admin").limit(20)
    for (const admin of admins || []) {
      await insertNotice(supabase, admin.id, await ownedWorkspace(supabase, admin.id), {
        title: "New payment to review",
        body: `${payment.planName} · EGP ${payment.amountEgp} · ${payment.method === "instapay" ? "InstaPay" : "E-wallet"} · ${payment.referenceCode}`,
        link: "/dashboard/admin/payments",
      })
    }
  } catch (error: any) {
    console.warn("[payment-notify] admin notice failed:", error?.message)
  }
}

export async function notifyCustomerOfReview(
  supabase: Db,
  input: { accountId: string; workspaceId: string | null; referenceCode: string | null; approved: boolean; note?: string | null },
) {
  try {
    const workspaceId = input.workspaceId || (await ownedWorkspace(supabase, input.accountId))
    const ref = input.referenceCode ? ` (${input.referenceCode})` : ""
    await insertNotice(supabase, input.accountId, workspaceId, input.approved
      ? { title: "Payment approved", body: `Your payment${ref} was approved and your plan is active.`, link: "/billing" }
      : { title: "Payment rejected", body: `Your payment${ref} was rejected${input.note ? `: ${input.note}` : "."}`, link: "/billing" })
  } catch (error: any) {
    console.warn("[payment-notify] customer notice failed:", error?.message)
  }
}
