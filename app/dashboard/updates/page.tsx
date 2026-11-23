import { getSupabaseServerClient } from "@/lib/supabase-server"
import { Sparkles } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { BRAND } from "@/lib/brand"

export const dynamic = 'force-dynamic'

export default async function UpdatesPage() {
  const supabase = await getSupabaseServerClient()
  
  const { data: updatesPageData } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "updates_page")
    .single()

  const isEnabled = updatesPageData?.value?.isEnabled ?? true

  const { data: updateBannerData } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "update_banner")
    .single()

  const bannerState = updateBannerData?.value || { content: "" }

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] p-4 text-center">
        <Sparkles className="w-12 h-12 text-neutral-600 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">No updates right now</h1>
        <p className="text-neutral-500 max-w-md">
          Check back later for new features, bug fixes, and improvements to {BRAND.name}!
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">What&apos;s New in {BRAND.name}</h1>
        <p className="text-neutral-400">Latest features and platform updates</p>
      </div>

      <div className="w-full flex items-center justify-center">
        <div className="w-full">
          {bannerState.content ? (
            <div className="w-full max-w-2xl mx-auto bg-[#111110] border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl overflow-y-auto max-h-[600px]">
              <div className="prose prose-invert prose-yellow max-w-none font-mono text-sm leading-relaxed text-neutral-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {bannerState.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md mx-auto text-center py-14 px-6 rounded-2xl bg-[#111110] border border-white/10 shadow-xl">
              <Sparkles className="w-8 h-8 text-neutral-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-1.5">No announcements right now</h3>
              <p className="text-sm text-neutral-400">
                New platform announcements and changelog updates will appear here when published.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
