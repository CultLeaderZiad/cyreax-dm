import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function BackToHome() {
  return (
    <Link href="/" className="absolute top-6 start-6 z-50 flex items-center gap-2 text-sm font-mono-ui text-neutral-400 hover:text-white transition-colors bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
      <ArrowLeft className="w-4 h-4" />
      Back to Home
    </Link>
  )
}
