"use client"

import React from "react"
import useSWR from "swr"
import { Pill } from "@/components/ui/Pill"
import { fetcher } from "@/lib/fetcher"

export interface PaymentItem {
  id?: string
  datePlan: string
  method: string
  reference: string
  status: "paid" | "verified" | "pending" | "rejected"
  statusLabel?: string
  amount: string
}

export interface RecentPaymentsTableProps {
  /** Override for previews; by default the table loads the account's real payments. */
  payments?: PaymentItem[]
}

interface ApiPayment {
  id: string
  createdAt: string
  plan: string | null
  amountEgp: number | null
  method: string | null
  referenceCode: string | null
  status: string
}

const METHOD_LABEL: Record<string, string> = { wallet: "E-wallet", instapay: "InstaPay" }

function toItem(p: ApiPayment): PaymentItem {
  let date = ""
  try {
    date = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", month: "short", day: "numeric", year: "numeric" }).format(new Date(p.createdAt))
  } catch {
    date = ""
  }
  const status: PaymentItem["status"] =
    p.status === "approved" || p.status === "active" ? "verified" : p.status === "rejected" ? "rejected" : "pending"
  return {
    id: p.id,
    datePlan: [date, p.plan].filter(Boolean).join(" · "),
    method: METHOD_LABEL[p.method || ""] || p.method || "—",
    reference: p.referenceCode || "—",
    status,
    statusLabel: status === "verified" ? "Approved" : undefined,
    amount: p.amountEgp != null ? `EGP ${new Intl.NumberFormat("en-US").format(p.amountEgp)}` : "—",
  }
}

export function RecentPaymentsTable({ payments }: RecentPaymentsTableProps) {
  const { data, isLoading } = useSWR<{ payments: ApiPayment[] }>(payments ? null : "/api/payments/manual", fetcher, {
    revalidateOnFocus: false,
  })
  const list: PaymentItem[] = payments ?? (data?.payments || []).map(toItem)

  const renderStatusPill = (item: PaymentItem) => {
    switch (item.status) {
      case "verified":
        return (
          <Pill variant="green" dot={false}>
            {item.statusLabel || "Verified"}
          </Pill>
        )
      case "paid":
        return (
          <Pill variant="green" dot={false}>
            {item.statusLabel || "Paid"}
          </Pill>
        )
      case "pending":
        return (
          <Pill variant="amber" dot={false}>
            {item.statusLabel || "Pending review"}
          </Pill>
        )
      case "rejected":
        return (
          <Pill variant="red" dot={false}>
            {item.statusLabel || "Rejected"}
          </Pill>
        )
      default:
        return (
          <Pill variant="neutral" dot={false}>
            {item.statusLabel || item.status}
          </Pill>
        )
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] overflow-hidden select-none space-y-0">
      <div className="p-4 border-b border-[var(--line)]">
        <h3 className="text-[13.5px] font-semibold text-[var(--t1)]">
          Recent payments
        </h3>
      </div>

      {isLoading && !payments ? (
        <div className="h-[72px] animate-pulse bg-[var(--s2)]/40" />
      ) : list.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[12.5px] text-[var(--t3)]">No payments yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-[12px] border-collapse" aria-label="Recent payments table">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s2)]/40 font-mono text-[10.5px] uppercase tracking-wider text-[var(--t3)]">
                <th scope="col" className="py-2.5 px-4 font-medium">
                  Date &amp; Plan
                </th>
                <th scope="col" className="py-2.5 px-3 font-medium">
                  Method
                </th>
                <th scope="col" className="py-2.5 px-3 font-medium">
                  Reference
                </th>
                <th scope="col" className="py-2.5 px-3 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2.5 px-4 font-medium text-end">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {list.map((p, idx) => (
                <tr key={p.id || idx} className="hover:bg-[var(--s2)]/50 transition-colors">
                  <td className="py-3 px-4 font-medium text-[var(--t1)]">
                    {p.datePlan}
                  </td>
                  <td className="py-3 px-3 text-[var(--t2)]">{p.method}</td>
                  <td className="py-3 px-3 font-mono text-[11px] text-[var(--t3)]">
                    <bdi>{p.reference}</bdi>
                  </td>
                  <td className="py-3 px-3">{renderStatusPill(p)}</td>
                  <td className="py-3 px-4 text-end font-mono text-[12.5px] font-semibold text-[var(--t1)] tabular-nums">
                    <bdi>{p.amount}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
