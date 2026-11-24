import { Suspense } from "react"
import DataDeletionClient from "./DataDeletionClient"

export const dynamic = "force-dynamic"

export default function DataDeletionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <DataDeletionClient />
    </Suspense>
  )
}
