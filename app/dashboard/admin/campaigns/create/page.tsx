"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/lib/i18n/LanguageContext"

export default function CreateCampaignPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    preview_text: "",
    template: "product_update",
    hero_image: "",
    heading: "",
    subheading: "",
    body_text: "",
    cta_text: "",
    cta_url: "",
    audience_filter: "all"
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveDraft = async (action: 'draft' | 'continue' = 'continue') => {
    if (!formData.name || !formData.subject || !formData.heading) {
      toast.error(t.reqFields)
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (!res.ok) throw new Error(t.failCreate)
      
      const data = await res.json()
      toast.success(t.draftSaved)
      if (action === 'continue' && data.campaign && data.campaign.id) {
        router.push(`/dashboard/admin/campaigns/${data.campaign.id}`)
      } else {
        router.push(`/dashboard/admin/campaigns?tab=drafts`)
      }
    } catch (error) {
      toast.error(t.failSave)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const isRtl = language === 'ar'

  return (
    <div className={`max-w-4xl mx-auto space-y-6 ${isRtl ? 'text-end' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.push("/dashboard/admin/campaigns")}
          className="text-[var(--t2)] hover:text-[var(--t1)]"
        >
          <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--t1)]">{t.newCampaign}</h2>
          <p className="text-[var(--t2)] text-sm mt-1">{t.configureEmail}</p>
        </div>
      </div>

      <Card className="bg-[var(--s1)] border-[var(--line)]">
        <CardContent className="p-6 space-y-8">
          
          {/* Section 1: Meta */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-[var(--t1)] border-b border-[var(--line)] pb-2">{t.campaignSettings}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">{t.internalName}</Label>
                <Input 
                  id="name" name="name" 
                  placeholder={t.egQ3Launch} 
                  value={formData.name} onChange={handleChange}
                  className="bg-[var(--s2)] border-[var(--line)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience_filter">{t.targetAudience}</Label>
                <Select value={formData.audience_filter} onValueChange={(val) => handleSelectChange('audience_filter', val)}>
                  <SelectTrigger className="bg-[var(--s2)] border-[var(--line)]">
                    <SelectValue placeholder={t.selectAudience} />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--s2)] border-[var(--line)]">
                    <SelectItem value="all">{t.allCustomers}</SelectItem>
                    <SelectItem value="paid">{t.allPaidFull}</SelectItem>
                    <SelectItem value="trial">{t.freeTrialOnly}</SelectItem>
                    <SelectItem value="monthly">{t.monthlyOnly}</SelectItem>
                    <SelectItem value="one_time">{t.oneTimeOnly}</SelectItem>
                    <SelectItem value="expired">{t.expiredSubs}</SelectItem>
                    <SelectItem value="newsletter">Newsletter Subscribers</SelectItem>
                    <SelectItem value="active">Active Customers</SelectItem>
                    <SelectItem value="inactive">Inactive Customers</SelectItem>
                    <SelectItem value="flagged">Flagged Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">{t.subjectLine}</Label>
              <Input 
                id="subject" name="subject" 
                placeholder={t.egExciting} 
                value={formData.subject} onChange={handleChange}
                className="bg-[var(--s2)] border-[var(--line)]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="preview_text">{t.previewText}</Label>
              <Input 
                id="preview_text" name="preview_text" 
                placeholder={t.showsUpInInbox} 
                value={formData.preview_text} onChange={handleChange}
                className="bg-[var(--s2)] border-[var(--line)]"
              />
            </div>
          </div>

          {/* Section 2: Content */}
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-medium text-[var(--t1)] border-b border-[var(--line)] pb-2">{t.emailContent}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="template">{t.designTemplate}</Label>
                <Select value={formData.template} onValueChange={(val) => handleSelectChange('template', val)}>
                  <SelectTrigger className="bg-[var(--s2)] border-[var(--line)]">
                    <SelectValue placeholder={t.selectTemplate} />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--s2)] border-[var(--line)]">
                    <SelectItem value="product_update">{t.productUpdate}</SelectItem>
                    <SelectItem value="new_feature">{t.newFeature}</SelectItem>
                    <SelectItem value="announcement">{t.generalAnnouncement}</SelectItem>
                    <SelectItem value="promotion">{t.promotionDiscount}</SelectItem>
                    <SelectItem value="trial_expiring">{t.trialExpiring}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero_image">{t.heroImageUrl}</Label>
                <Input 
                  id="hero_image" name="hero_image" 
                  placeholder="https://..." 
                  value={formData.hero_image} onChange={handleChange}
                  className="bg-[var(--s2)] border-[var(--line)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="heading">{t.mainHeading}</Label>
              <Input 
                id="heading" name="heading" 
                placeholder={t.egIntroducing} 
                value={formData.heading} onChange={handleChange}
                className="bg-[var(--s2)] border-[var(--line)]"
              />
              <p className="text-xs text-[var(--t3)]">{t.supportsVar}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subheading">{t.subheadingOpt}</Label>
              <Input 
                id="subheading" name="subheading" 
                placeholder={t.egAutomate} 
                value={formData.subheading} onChange={handleChange}
                className="bg-[var(--s2)] border-[var(--line)]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_text">{t.bodyText}</Label>
              <Textarea 
                id="body_text" name="body_text" 
                placeholder={t.mainMessage} 
                rows={6}
                value={formData.body_text} onChange={handleChange}
                className="bg-[var(--s2)] border-[var(--line)]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="cta_text">{t.buttonTextOpt}</Label>
                <Input 
                  id="cta_text" name="cta_text" 
                  placeholder={t.egTryNow} 
                  value={formData.cta_text} onChange={handleChange}
                  className="bg-[var(--s2)] border-[var(--line)]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cta_url">{t.buttonUrlOpt}</Label>
                <Input 
                  id="cta_url" name="cta_url" 
                  placeholder="https://..." 
                  value={formData.cta_url} onChange={handleChange}
                  className="bg-[var(--s2)] border-[var(--line)]"
                />
              </div>
            </div>

          </div>

          <div className={`flex justify-end pt-4 border-t border-[var(--line)] gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <Button 
              onClick={() => handleSaveDraft('draft')} 
              disabled={loading}
              variant="outline"
              className="bg-transparent border-[var(--line)] text-[var(--t1)] hover:bg-[var(--s2)]"
            >
              {loading ? <Loader2 className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'} animate-spin`} /> : <Save className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'}`} />}
              Save to drafts page
            </Button>
            <Button 
              onClick={() => handleSaveDraft('continue')} 
              disabled={loading}
              className="bg-white text-black hover:bg-zinc-200"
            >
              {loading ? <Loader2 className={`w-4 h-4 ${isRtl ? 'ms-2' : 'me-2'} animate-spin`} /> : null}
              Continue
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
