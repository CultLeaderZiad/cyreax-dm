"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Loader2, Send, Activity, Users, Mail, AlertTriangle } from "lucide-react"
import { toast } from "react-hot-toast"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  audience_filter: string
  recipient_count: number
  scheduled_at?: string | null
}

interface CustomerPreview {
  id: string
  full_name?: string
  email: string
  plan: string
}

export default function CampaignDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { t, language } = useLanguage()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [audience, setAudience] = useState<CustomerPreview[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [sendingTest, setSendingTest] = useState(false)
  const [sendingReal, setSendingReal] = useState(false)
  const [scheduleTime, setScheduleTime] = useState("")

  const handleScheduleCampaign = async () => {
    if (!scheduleTime) {
      toast.error("Please select a date and time to schedule the campaign.")
      return
    }

    const scheduledDate = new Date(scheduleTime)
    if (scheduledDate.getTime() <= Date.now()) {
      toast.error("Schedule time must be in the future.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduled_at: scheduledDate.toISOString()
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to schedule campaign")
      
      toast.success("Campaign scheduled successfully!")
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelSchedule = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          scheduled_at: null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to cancel schedule")
      
      toast.success("Schedule cancelled and returned to draft!")
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Campaign
      const resCamp = await fetch(`/api/admin/campaigns/${id}`)
      if (!resCamp.ok) throw new Error("Failed to fetch campaign")
      const campData = await resCamp.json()
      setCampaign(campData.campaign)

      // 2. Fetch Audience Preview — always fetch with 'all' filter first, then apply campaign filter client-side
      const filterParam = campData.campaign.audience_filter === 'newsletter' ? 'newsletter' : 'all'
      const resAud = await fetch(`/api/admin/customers?filter=${filterParam}`)
      if (resAud.ok) {
        const audData = await resAud.json()
        let customers = audData.customers || []
        // Apply campaign-specific filter client-side
        const af = campData.campaign.audience_filter
        if (af && af !== 'all' && af !== 'newsletter') {
          if (af === 'trial') customers = customers.filter((c: any) => c.plan === 'trial')
          else if (af === 'monthly') customers = customers.filter((c: any) => c.plan === 'monthly')
          else if (af === 'one_time') customers = customers.filter((c: any) => c.plan === 'one_time')
          else if (af === 'expired') customers = customers.filter((c: any) => c.plan === 'expired')
          else if (af === 'paid') customers = customers.filter((c: any) => ['monthly', 'one_time'].includes(c.plan))
          else if (af === 'active') customers = customers.filter((c: any) => ['active', 'trialing'].includes(c.subscription_status))
          else if (af === 'inactive') customers = customers.filter((c: any) => ['canceled', 'unpaid', 'past_due'].includes(c.subscription_status))
          else if (af === 'flagged') customers = customers.filter((c: any) => c.is_flagged)
        }
        setAudience(customers)
        setSelectedCustomerIds(new Set(customers.map((c: any) => c.id)))
      }
    } catch (error) {
      toast.error("Failed to load details")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendTest = async () => {
    setSendingTest(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/send-test`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t.failSendTest)
      toast.success(t.testEmailSent)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSendingTest(false)
    }
  }

  const handleToggleCustomer = (customerId: string) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  const handleToggleAll = () => {
    if (selectedCustomerIds.size === audience.length) {
      setSelectedCustomerIds(new Set())
    } else {
      setSelectedCustomerIds(new Set(audience.map(c => c.id)))
    }
  }

  const [confirmSendOpen, setConfirmSendOpen] = useState(false)

  const handleSendReal = () => {
    setConfirmSendOpen(true)
  }

  const handleConfirmSendReal = async () => {
    setSendingReal(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAccountIds: Array.from(selectedCustomerIds) })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t.failSendCampaign)
      
      toast.success(t.campaignSentTo.replace('{{count}}', data.recipient_count.toString()))
      setConfirmSendOpen(false)
      fetchData() // Refresh status
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSendingReal(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>
  }

  if (!campaign) {
    return <div className="text-center p-12 text-zinc-400">{t.campaignNotFound}</div>
  }

  const isDraft = campaign.status === "draft" || campaign.status === "failed" || campaign.status === "scheduled"
  const isRtl = language === 'ar'

  return (
    <div className={`max-w-5xl mx-auto space-y-6 ${isRtl ? 'text-end' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push("/dashboard/admin/campaigns")}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              {campaign.name}
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                campaign.status === "draft" 
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700' 
                  : campaign.status === "scheduled"
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
              }`}>
                {campaign.status.toUpperCase()}
              </span>
            </h2>
            <p className="text-zinc-400 text-sm mt-1">{t.subjectLabel} {campaign.subject}</p>
          </div>
        </div>
        
        {campaign.status === "scheduled" && (
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-xs font-mono">
              Scheduled: {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "N/A"}
            </span>
            <Button 
              onClick={handleCancelSchedule}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1.5 h-auto rounded px-3"
            >
              Cancel Schedule
            </Button>
          </div>
        )}

        {(campaign.status === "draft" || campaign.status === "failed") && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button 
              variant="outline"
              onClick={handleSendTest}
              disabled={sendingTest || sendingReal}
              className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
            >
              {sendingTest ? <Loader2 className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'} animate-spin`} /> : <Mail className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'}`} />}
              {t.sendTestEmail}
            </Button>
            <Button 
              onClick={handleSendReal}
              disabled={sendingTest || sendingReal || selectedCustomerIds.size === 0}
              className="bg-brand-500 hover:bg-brand-600 text-black font-semibold"
            >
              {sendingReal ? <Loader2 className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'} animate-spin`} /> : <Send className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'}`} />}
              {t.sendToCustomers.replace('{{count}}', selectedCustomerIds.size.toString())}
            </Button>
            <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 p-1 rounded-lg">
              <input 
                type="datetime-local" 
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="bg-black text-white border border-zinc-800 rounded px-2 py-1 text-xs outline-none font-mono"
              />
              <Button 
                onClick={handleScheduleCampaign}
                disabled={sendingTest || sendingReal || !scheduleTime}
                className="bg-white hover:bg-white/90 text-black text-xs font-semibold py-1 h-7 rounded px-3"
              >
                Schedule
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col - Audience Preview */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-[#0a0a0a] border-zinc-800">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-400" />
                    {t.audiencePreview}
                  </CardTitle>
                  <CardDescription>
                    {t.filter} <strong>{campaign.audience_filter}</strong> {t.matchingCustomers.replace('{{count}}', audience.length.toString())}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-start">
                <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/80 sticky top-0 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3 w-[50px] text-center">
                      <Checkbox 
                        checked={selectedCustomerIds.size > 0 && selectedCustomerIds.size === audience.length}
                        onCheckedChange={handleToggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className={`px-4 py-3 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>Name</th>
                    <th className={`px-4 py-3 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.email}</th>
                    <th className={`px-4 py-3 font-medium ${isRtl ? 'text-end' : 'text-start'}`}>{t.plan}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {audience.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                        {t.noCustomersMatch}
                      </td>
                    </tr>
                  ) : (
                    audience.map(c => (
                      <tr key={c.id} className="hover:bg-zinc-900/30">
                        <td className="px-4 py-3 text-center">
                          <Checkbox 
                            checked={selectedCustomerIds.has(c.id)}
                            onCheckedChange={() => handleToggleCustomer(c.id)}
                            aria-label={`Select ${c.email}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{c.full_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-zinc-300">{c.email}</td>
                        <td className="px-4 py-3 text-zinc-400">{c.plan}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Col - Checklist & Status */}
        <div className="space-y-6">
          <Card className="bg-[#0a0a0a] border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-lg">{t.preFlightChecklist}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-zinc-800">
                <li className="p-4 flex items-start gap-3">
                  <div className={`mt-0.5 rounded-full p-1 ${campaign.subject ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {campaign.subject ? <Send className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{t.subjectLine}</p>
                    <p className="text-xs text-zinc-500">{campaign.subject || t.missing}</p>
                  </div>
                </li>
                <li className="p-4 flex items-start gap-3">
                  <div className={`mt-0.5 rounded-full p-1 ${audience.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {audience.length > 0 ? <Users className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{t.validAudience}</p>
                    <p className="text-xs text-zinc-500">{t.recipientsFound.replace('{{count}}', audience.length.toString())}</p>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>

          {!isDraft && (
            <Card className="bg-[#0a0a0a] border-zinc-800">
              <CardHeader className="border-b border-zinc-800">
                <CardTitle className="text-lg">{t.deliveryStatus}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 text-center">
                <Activity className="w-8 h-8 text-brand-400 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-white">{campaign.recipient_count}</h3>
                <p className="text-sm text-zinc-400">{t.totalRecipientsProcessed}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      <ConfirmDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title={isRtl ? "إرسال الحملة" : "Send Campaign"}
        description={t.confirmSend.replace('{{count}}', selectedCustomerIds.size.toString())}
        confirmLabel={isRtl ? "إرسال الآن" : "Send Now"}
        variant="default"
        loading={sendingReal}
        onConfirm={handleConfirmSendReal}
      />
    </div>
  )
}
