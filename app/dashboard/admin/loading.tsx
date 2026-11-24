import { Loader2 } from "lucide-react"

export default function Loading() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto p-8 w-full animate-in fade-in duration-500">
            {/* Stats Panel Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="border border-[var(--line)] rounded-xl p-4 bg-[var(--s2)] flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-white/10 animate-pulse" />
                        <div className="space-y-2">
                            <div className="h-6 w-16 bg-white/10 rounded animate-pulse" />
                            <div className="h-3 w-20 bg-[var(--s2)] rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs Skeleton */}
            <div className="flex gap-4 border-b border-[var(--line)] pb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-6 w-20 bg-white/10 rounded animate-pulse" />
                ))}
            </div>

            {/* Table/Content Skeleton */}
            <div className="border border-[var(--line)] rounded-xl overflow-hidden mt-6">
                <div className="h-10 bg-white/[0.04] border-b border-[var(--line)]" />
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="flex h-12 border-b border-white/[0.02] items-center px-4 gap-4">
                        <div className="h-4 w-1/4 bg-[var(--s2)] rounded animate-pulse" />
                        <div className="h-4 w-24 bg-[var(--s2)] rounded-full animate-pulse" />
                        <div className="h-4 w-20 bg-[var(--s2)] rounded-full animate-pulse" />
                        <div className="h-4 w-16 bg-[var(--s2)] rounded animate-pulse" />
                    </div>
                ))}
            </div>
            
            <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
            </div>
        </div>
    )
}
