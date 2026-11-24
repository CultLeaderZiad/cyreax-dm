import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getSupabaseBypassClient } from "@/lib/supabase-server"
import { Sparkles, Calendar, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { BRAND } from "@/lib/brand"

export const dynamic = "force-dynamic"

export default async function UpdatesPage() {
  let bannerState = { isActive: false, type: "", message: "", link: "", content: "" }
  try {
    const supabase = await getSupabaseBypassClient()
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "update_banner")
      .single()

    if (data?.value) {
      bannerState = data.value
    }
  } catch (err) {
    console.error("[UpdatesPage] Server fetch error:", err)
  }

  return (
    <div className="min-h-screen text-white flex flex-col justify-between selection:bg-[#e5a93c] selection:text-black relative">
      <FrontBackground />
      <div>
        <Header activeHref="/updates" />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-20 relative z-10">
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono-ui text-neutral-400 hover:text-[#e5a93c] transition-colors mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>

            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#e5a93c]/10 text-[#e5a93c] text-[10px] font-mono-ui font-semibold border border-[#e5a93c]/25 tracking-wider uppercase">
                <Sparkles className="w-3 h-3" /> Official Changelog
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl text-white font-bold tracking-tight">
              {BRAND.name} Updates
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base mt-2">
              New features, platform upgrades, API performance enhancements, and bug fixes.
            </p>
          </div>

          <div className="bg-gradient-to-b from-[#0c0c14] to-[#06060a] border border-white/10 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] text-xs font-mono-ui text-neutral-500">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <Calendar className="w-3.5 h-3.5 text-[#e5a93c]" />
                Latest Release
              </span>
              <span className="text-emerald-400">Live in Production</span>
            </div>

            <div className="prose prose-invert prose-yellow max-w-none font-mono text-sm leading-relaxed text-neutral-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {bannerState.content || "### Recent Updates & Improvements\n\n- **Target specific posts**: Link automation rules directly to individual Instagram or Facebook posts and reels.\n- **Link validation**: Preview and verify mobile links instantly before publishing automation rules.\n- **Independent rule triggers**: Rules execute strictly on their selected posts without affecting other content.\n- **Smart sentiment detection**: Understand comment tone and automatically prioritize high-intent customer inquiries.\n- **Unified workflow view**: Manage recent content, automations, templates, and conversational funnels from one place."}
              </ReactMarkdown>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  )
}
