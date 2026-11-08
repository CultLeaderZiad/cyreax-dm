import { transition } from "@/lib/state/machines"
export const ORDER_STATUSES = ["draft", "pending_payment", "paid", "fulfilled", "cancelled", "refunded"] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Transitions live in lib/state/machines.ts (MACHINES.order).
export function applyOrderStatus(current: OrderStatus, next: OrderStatus): { status: OrderStatus; changed: boolean } {
  return transition("order", current, next) as { status: OrderStatus; changed: boolean }
}

export function orderStatusMatches(triggerKeywords: string | null | undefined, status: string): boolean {
  const expected = String(triggerKeywords || "paid").trim().toLowerCase()
  if (!expected || expected === "any") return true
  const statuses = expected.split(",").map((item) => item.trim()).filter(Boolean)
  return statuses.includes(status.trim().toLowerCase())
}

export interface OrderDraft {
  currency: string
  totalCents: number
  items: Array<{ productId: string; name: string; quantity: number; unitCents: number }>
}

export function buildOrderDraft(
  products: Array<{ id: string; name: string; priceCents: number; currency: string }>,
  quantities: Record<string, number> = {},
): OrderDraft {
  const items = products.map((product) => {
    const quantity = Math.max(1, Math.min(20, Math.round(quantities[product.id] || 1)))
    return { productId: product.id, name: product.name, quantity, unitCents: product.priceCents }
  })
  const currency = products[0]?.currency || "EGP"
  const totalCents = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0)
  return { currency, totalCents, items }
}
