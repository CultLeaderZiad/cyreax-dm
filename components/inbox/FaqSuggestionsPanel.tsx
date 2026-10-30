"use client"

import { useState, useEffect } from "react"
import { Sparkles, RefreshCcw, ArrowRight, Loader2, MessageSquareQuote } from "lucide-react"
import Link from "next/link"

export function FaqSuggestionsPanel({ userId }: { userId: string }) {
    const [faqs, setFaqs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false) // For mobile/tablet toggle if needed

    const fetchFaqs = async (force = false) => {
        if (!userId) return
        setLoading(true)
        try {
            const res = await fetch(`/api/ai/analyze-inbox-faqs${force ? "?force=true" : ""}`, { method: "POST" })
            const data = await res.json()
            if (data.faqs) setFaqs(data.faqs)
        } catch (e) {
            console.error("Failed to fetch FAQs", e)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchFaqs()
    }, [userId])

    return (
        <div className="h-full flex flex-col bg-black/40 border-s border-white/5 w-[300px] xl:w-[350px]">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#e5a93c]" />
                    <h3 className="font-bold text-white text-sm">Frequent Questions</h3>
                </div>
                <button 
                    onClick={() => fetchFaqs(true)} 
                    disabled={loading}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 transition-colors disabled:opacity-50"
                    title="Force refresh (uses AI credits)"
                >
                    <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                    AI analyzes your recent DMs to find common questions. Turn them into quick replies or automated flows.
                </p>

                {loading && faqs.length === 0 ? (
                    <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-neutral-500" /></div>
                ) : faqs.length > 0 ? (
                    faqs.map((faq: any, index: number) => (
                        <div 
                            key={faq.id} 
                            className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-3 animate-in fade-in slide-in-from-right-4"
                            style={{ animationFillMode: 'both', animationDelay: `${index * 75}ms`, animationDuration: '400ms' }}
                        >
                            <div>
                                <div className="flex items-start justify-between mb-1">
                                    <h4 className="text-xs font-bold text-white capitalize flex items-center gap-1.5">
                                        <MessageSquareQuote className="w-3.5 h-3.5 text-neutral-400" />
                                        {faq.topic}
                                    </h4>
                                    <span className="text-[9px] font-mono-ui bg-white/10 px-1.5 py-0.5 rounded text-neutral-300">{faq.count}x</span>
                                </div>
                                <p className="text-[11px] text-neutral-400 italic line-clamp-2">"{faq.examples}"</p>
                            </div>
                            
                            <div className="flex flex-col gap-1.5 mt-1">
                                <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Suggested keywords:</span>
                                <div className="flex flex-wrap gap-1">
                                    {faq.keywords?.split(",").map((k: string, i: number) => (
                                        <span key={i} className="text-[9px] bg-[#e5a93c]/10 text-[#e5a93c] px-1.5 py-0.5 rounded">
                                            {k.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <Link 
                                href={`/dashboard/automations?intent=${encodeURIComponent("When someone DMs asking about " + faq.topic + " matching keywords: " + faq.keywords)}`}
                                className="text-[10px] font-bold text-black bg-white hover:bg-[#e5a93c] py-1.5 rounded flex items-center justify-center gap-1 transition-colors mt-2"
                            >
                                Automate Answer <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ))
                ) : (
                    <div className="py-8 text-center text-neutral-500 text-xs">
                        No recurring questions detected recently.
                    </div>
                )}
            </div>
        </div>
    )
}
