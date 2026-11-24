"use client"

import { AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <div className="text-center">
            <h2 className="text-lg font-medium text-[var(--t1)] mb-2">Something went wrong</h2>
            <p className="text-sm text-[var(--t2)] max-w-md mx-auto">{error.message || "An unexpected error occurred."}</p>
        </div>
        <button
            onClick={() => reset()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-[var(--t1)] rounded-lg text-sm transition-colors mt-4"
        >
            Try again
        </button>
    </div>
  )
}
