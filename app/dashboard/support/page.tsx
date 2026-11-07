import { Suspense } from "react"
import { SupportCenter } from "@/components/support/SupportCenter"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportCenter />
    </Suspense>
  )
}
