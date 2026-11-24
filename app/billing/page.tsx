import { Suspense } from "react"
import BillingClient from "./BillingClient"

export const dynamic = "force-dynamic"

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <BillingClient />
    </Suspense>
  )
}
