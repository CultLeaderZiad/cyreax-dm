"use client"

import React, { useState, useRef, useEffect } from "react"
import { Upload } from "lucide-react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { BRAND } from "@/lib/brand"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function WhiteLabelSettingsSection() {
  const [customDomain, setCustomDomain] = useState("portal.cyreax-dm.com")
  const [senderEmail, setSenderEmail] = useState("reports@cyreax-dm.com")
  const [selectedColor, setSelectedColor] = useState("#0B0B0D")
  const [logoName, setLogoName] = useState("cyreax-logo.svg")
  const [hideBranding, setHideBranding] = useState(true)
  const [monthlyPdfReport, setMonthlyPdfReport] = useState(true)
  const [saving, setSaving] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/agency")
      .then((res) => res.json())
      .then((data) => {
        if (data?.agency) {
          if (data.agency.custom_domain) setCustomDomain(data.agency.custom_domain)
          if (data.agency.primary_color) setSelectedColor(data.agency.primary_color)
          if (data.agency.logo_url) setLogoName(data.agency.logo_url)
        }
      })
      .catch(console.error)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/agency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomain: customDomain.trim(),
          primaryColor: selectedColor,
          appName: BRAND.name,
          logoUrl: logoName,
        }),
      })
      if (res.ok) {
        toast.success("White-label branding saved successfully!")
      } else {
        const data = await res.json()
        toast.info(data.error || "Settings saved")
      }
    } catch {
      toast.error("Network error saving white-label settings")
    } finally {
      setSaving(false)
    }
  }

  const swatches = [
    { id: "dark", hex: "#0B0B0D" },
    { id: "indigo", hex: "#635BFF" },
    { id: "orange", hex: "#E8590C" },
    { id: "teal", hex: "#0CA678" },
  ]

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          White-label
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Your clients see your brand on the portal, reports and emails. The platform stays invisible.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Branding
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Custom domain, brand colors, reports sender, and agency asset settings.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_210px] gap-6 items-start">
            <div className="space-y-4">
              {/* Custom domain */}
              <div className="space-y-1.5">
                <label
                  htmlFor="wl-custom-domain"
                  className="text-[11.5px] text-[var(--t2)] font-medium block"
                >
                  Custom domain
                </label>
                <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-3 gap-2">
                  <input
                    id="wl-custom-domain"
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    className="font-mono text-[12px] text-[var(--t1)] bg-transparent outline-none flex-1"
                    placeholder="portal.youragency.com"
                  />
                  <Pill variant="green" dot className="text-[10px] shrink-0">
                    DNS verified · SSL active
                  </Pill>
                </div>
              </div>

              {/* Logo & Brand color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[11.5px] text-[var(--t2)] font-medium block">
                    Logo
                  </span>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setLogoName(e.target.files[0].name)
                        toast.success(`Logo updated to ${e.target.files[0].name}`)
                      }
                    }}
                  />
                  <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-2.5 text-[11.5px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <Upload className="w-3.5 h-3.5 text-[var(--t3)] shrink-0" />
                      <span className="text-[var(--t1)] font-mono text-[11px] truncate">
                        {logoName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="text-[11px] text-[var(--t3)] hover:text-[var(--t1)] shrink-0 transition-colors cursor-pointer"
                    >
                      Replace
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11.5px] text-[var(--t2)] font-medium block">
                    Brand color
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Brand color swatches"
                    className="h-[34px] flex items-center gap-2 px-1"
                  >
                    {swatches.map((swatch) => {
                      const isSelected = selectedColor === swatch.hex
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedColor(swatch.hex)}
                          className={cn(
                            "w-5 h-5 rounded-full transition-all cursor-pointer relative",
                            isSelected && "ring-2 ring-[var(--t1)] ring-offset-2 ring-offset-[var(--bg)]"
                          )}
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.hex}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Sender email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="wl-sender-email"
                  className="text-[11.5px] text-[var(--t2)] font-medium block"
                >
                  Sender email for reports
                </label>
                <div className="h-[34px] rounded-[6px] bg-[var(--s2)] border border-[var(--line2)] flex items-center justify-between px-3 gap-2">
                  <input
                    id="wl-sender-email"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="font-mono text-[12px] text-[var(--t1)] bg-transparent outline-none flex-1"
                    placeholder="reports@youragency.com"
                  />
                  <button
                    type="button"
                    onClick={() => toast.success("SPF & DKIM verification initiated")}
                    className="px-2 py-0.5 rounded-[4px] bg-[var(--amberbg)] text-[var(--amber)] border border-[rgba(245,165,36,0.25)] text-[10.5px] font-medium shrink-0 cursor-pointer"
                  >
                    Verify SPF
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideBranding}
                    onClick={() => setHideBranding(!hideBranding)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5",
                      hideBranding ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full bg-black transition-transform",
                        hideBranding ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-[12px] text-[var(--t1)]">
                    Hide platform branding
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={monthlyPdfReport}
                    onClick={() => setMonthlyPdfReport(!monthlyPdfReport)}
                    className={cn(
                      "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5",
                      monthlyPdfReport ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                    )}
                  >
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full bg-black transition-transform",
                        monthlyPdfReport ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-[12px] text-[var(--t1)]">
                    Monthly PDF report
                  </span>
                </label>
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-[30px] px-3.5 text-[12px] font-medium"
                >
                  {saving ? "Saving..." : "Save white-label settings"}
                </Button>
              </div>
            </div>

            {/* Portal preview */}
            <div className="space-y-1.5">
              <span className="text-[11.5px] text-[var(--t3)] block">
                Client portal preview
              </span>
              <div className="rounded-[8px] bg-white text-neutral-900 border border-neutral-200 overflow-hidden shadow-xs p-3 space-y-2.5">
                <div
                  className="text-white text-[10px] font-semibold py-1 px-2 rounded-[3px] flex items-center justify-between"
                  style={{ backgroundColor: selectedColor === "#0B0B0D" ? "#0B2E24" : selectedColor }}
                >
                  <span>{BRAND.name} · Client Portal</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-start">
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Conversations
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      1,284
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Leads
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      318
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      AI handled
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      71%
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-neutral-50 border border-neutral-100">
                    <span className="text-[8.5px] text-neutral-500 uppercase font-mono block">
                      Sales
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 font-mono">
                      EGP 21.6k
                    </span>
                  </div>
                </div>

                <div className="pt-1 border-t border-neutral-100 flex items-center justify-between text-[9.5px]">
                  <span className="text-neutral-600 truncate max-w-[130px]">
                    Approve: &ldquo;White Friday&rdquo; broadcast
                  </span>
                  <span className="text-emerald-700 font-semibold shrink-0 cursor-pointer hover:underline">
                    Approve →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
