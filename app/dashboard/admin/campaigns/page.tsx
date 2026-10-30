"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Plus, Mail, Clock, Send, AlertTriangle, ArrowRight, Activity, Users } from "lucide-react"
import { toast } from "react-hot-toast"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { useSearchParams } from "next/navigation"

interface Campaign {
  id: string
  name: string
  subject: string
  template: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed'
  audience_filter: string
  recipient_count: number
  created_at: string
  sent_at: string | null
  scheduled_at?: string | null
}

export default function CampaignsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const { t, language } = useLanguage()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(tabParam || "all")

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/campaigns")
      if (!res.ok) throw new Error("Failed to fetch campaigns")
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (error) {
      toast.error("Failed to load campaigns")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 font-medium border border-zinc-700 flex items-center gap-1.5"><Clock className="w-3 h-3" /> {t.draft}</span>
      case 'scheduled':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Scheduled</span>
      case 'sending':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20 flex items-center gap-1.5"><Activity className="w-3 h-3 animate-pulse" /> {t.sending}</span>
      case 'completed':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 flex items-center gap-1.5"><Send className="w-3 h-3" /> {t.completed}</span>
      case 'failed':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-red-500/10 text-red-400 font-medium border border-red-500/20 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> {t.failed}</span>
      default:
        return null
    }
  }

  const formatAudience = (filter: string) => {
    const map: Record<string, string> = {
      'all': t.allCustomers || "All Customers",
      'paid': t.allPaid || "Paid Customers",
      'trial': t.freeTrial || "Free Trial",
      'monthly': t.monthlyPlan || "Monthly Plan",
      'one_time': t.oneTimePlan || "One-Time Plan",
      'expired': t.expiredSubs || "Expired Subscriptions",
      'newsletter': "Newsletter Subscribers",
      'active': "Active Subscribers",
      'inactive': "Inactive Subscribers",
      'flagged': "Flagged Accounts",
    }
    return map[filter] || filter
  }

  const isRtl = language === 'ar'

  return (
    <div className={`space-y-6 ${isRtl ? 'text-end' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Mail className="w-6 h-6 text-[#e5a93c]" />
            {t.communicationCenter}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            {t.communicationCenterDesc}
          </p>
        </div>
        <Button 
          onClick={() => router.push("/dashboard/admin/campaigns/create")}
          className="bg-white hover:bg-neutral-200 text-black font-semibold"
        >
          <Plus className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'}`} />
          {t.newCampaign}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#0a0a0a] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-400">{t.totalCampaigns}</p>
                <p className="text-3xl font-bold text-white">{campaigns.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-brand-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-400">{t.totalEmailsSent}</p>
                <p className="text-3xl font-bold text-white">
                  {campaigns.filter(c => c.status === 'completed').reduce((acc, curr) => acc + (curr.recipient_count || 0), 0)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0a0a] border-zinc-800">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-400">{t.activeDrafts}</p>
                <p className="text-3xl font-bold text-white">{campaigns.filter(c => c.status === 'draft').length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <Clock className="w-5 h-5 text-zinc-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns List */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); router.replace(`/dashboard/admin/campaigns?tab=${val}`); }} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800">All Campaigns</TabsTrigger>
            <TabsTrigger value="scheduled" className="data-[state=active]:bg-zinc-800">Scheduled</TabsTrigger>
            <TabsTrigger value="drafts" className="data-[state=active]:bg-zinc-800">Drafts</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="m-0">
          <Card className="bg-[#0a0a0a] border-zinc-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <CardTitle className="text-lg">{t.recentCampaigns}</CardTitle>
              <CardDescription>{t.recentCampaignsDesc}</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                  <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
                  {t.loadingCampaigns}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
                    <Mail className="w-8 h-8 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-medium text-white mb-2">{t.noCampaignsYet}</h3>
                  <p className="text-zinc-400 max-w-sm mb-6">{t.createFirstCampaign}</p>
                  <Button 
                    onClick={() => router.push("/dashboard/admin/campaigns/create")}
                    className="bg-[#ccff00] hover:bg-[#b3e600] text-black font-semibold"
                  >
                    {t.newCampaign}
                  </Button>
                </div>
              ) : (
                <table className="w-full text-sm text-start">
                  <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.campaignName}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.status}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.audience}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.recipients}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.date}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-start' : 'text-end'}`}>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {campaigns.filter(c => c.status !== 'draft').map((campaign) => (
                      <tr 
                        key={campaign.id} 
                        className="hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/dashboard/admin/campaigns/${campaign.id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{campaign.name}</div>
                          <div className="text-zinc-500 text-xs truncate max-w-xs">{campaign.subject}</div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(campaign.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-zinc-300">
                            <Users className="w-3.5 h-3.5 me-1.5 text-zinc-500" />
                            {formatAudience(campaign.audience_filter)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-300">
                          {campaign.recipient_count}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-xs">
                          {new Date(campaign.created_at).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 text-end">
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-400 hover:text-brand-300 hover:bg-brand-500/10">
                            View
                            <ArrowRight className="w-4 h-4 ms-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {campaigns.filter(c => c.status !== 'draft').length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                          No active or completed campaigns yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="m-0">
          <Card className="bg-[#0a0a0a] border-zinc-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <CardTitle className="text-lg">Scheduled Campaigns</CardTitle>
              <CardDescription>Campaigns that are scheduled to be sent in the future.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                  <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
                  {t.loadingCampaigns}
                </div>
              ) : campaigns.filter(c => c.status === 'scheduled').length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
                    <Clock className="w-8 h-8 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-medium text-white mb-2">No scheduled campaigns</h3>
                  <p className="text-zinc-400 max-w-sm mb-6">You don't have any scheduled campaigns.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-start">
                  <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.campaignName}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.status}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.audience}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>Scheduled For</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-start' : 'text-end'}`}>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {campaigns.filter(c => c.status === 'scheduled').map((campaign) => (
                      <tr 
                        key={campaign.id} 
                        className="hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/dashboard/admin/campaigns/${campaign.id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{campaign.name}</div>
                          <div className="text-zinc-500 text-xs truncate max-w-xs">{campaign.subject}</div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(campaign.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-zinc-300">
                            <Users className="w-3.5 h-3.5 me-1.5 text-zinc-500" />
                            {formatAudience(campaign.audience_filter)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-blue-400 text-xs font-mono">
                          {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "N/A"}
                        </td>
                        <td className="px-6 py-4 text-end">
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-400 hover:text-brand-300 hover:bg-brand-500/10">
                            View
                            <ArrowRight className="w-4 h-4 ms-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="m-0">
          <Card className="bg-[#0a0a0a] border-zinc-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <CardTitle className="text-lg">Draft Campaigns</CardTitle>
              <CardDescription>Campaigns that are saved as drafts and not yet sent.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-zinc-500 flex flex-col items-center">
                  <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
                  {t.loadingCampaigns}
                </div>
              ) : campaigns.filter(c => c.status === 'draft').length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
                    <Clock className="w-8 h-8 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-medium text-white mb-2">No drafts</h3>
                  <p className="text-zinc-400 max-w-sm mb-6">You don't have any drafts.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-start">
                  <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.campaignName}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.status}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.audience}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.date}</th>
                      <th className={`px-6 py-4 font-medium ${isRtl ? 'text-start' : 'text-end'}`}>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {campaigns.filter(c => c.status === 'draft').map((campaign) => (
                      <tr 
                        key={campaign.id} 
                        className="hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/dashboard/admin/campaigns/${campaign.id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{campaign.name}</div>
                          <div className="text-zinc-500 text-xs truncate max-w-xs">{campaign.subject}</div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(campaign.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-zinc-300">
                            <Users className="w-3.5 h-3.5 me-1.5 text-zinc-500" />
                            {formatAudience(campaign.audience_filter)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-xs">
                          {new Date(campaign.created_at).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 text-end">
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-400 hover:text-brand-300 hover:bg-brand-500/10">
                            Edit
                            <ArrowRight className="w-4 h-4 ms-1" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
