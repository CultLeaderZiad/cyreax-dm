"use client"

import React from "react"
import { Pill } from "@/components/ui/Pill"

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
  payments?: PaymentItem[]
  currency?: "EGP" | "SAR" | "USD"
}

export function RecentPaymentsTable({
  payments,
  currency = "EGP",
}: RecentPaymentsTableProps) {
  const defaultPayments: PaymentItem[] = [
    {
      datePlan: "Oct 1, 2026 · Agency Growth",
      method: "Vodafone Cash",
      reference: "HLX-3K8P",
      status: "verified",
      statusLabel: "Verified in 2h",
      amount:
        currency === "SAR"
          ? "SAR 1,220"
          : currency === "USD"
          ? "$329"
          : "EGP 15,700",
    },
    {
      datePlan: "Sep 1, 2026 · Agency Growth",
      method: "Card ·· 4242",
      reference: "in_109x...",
      status: "paid",
      statusLabel: "Paid",
      amount:
        currency === "SAR"
          ? "SAR 1,150"
          : currency === "USD"
          ? "$310"
          : "EGP 14,750",
    },
  ]

  const list = payments !== undefined ? payments : defaultPayments

  const renderStatusPill = (item: PaymentItem) => {
    switch (item.status) {
      case "verified":
        return (
          <Pill variant="green" dot={false}>
            {item.statusLabel || "Verified in 2h"}
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

      {list.length === 0 ? (
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
