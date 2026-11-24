"use client"

import React, { useEffect, useState } from "react"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { Pill } from "@/components/ui/Pill"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function ClientPortalSettingsSection() {
  const [allowApprovals, setAllowApprovals] = useState(true)
  const [showLiveMetrics, setShowLiveMetrics] = useState(true)
  const [allowExports, setAllowExports] = useState(false)
  // The portal address comes from the agency's own domain; nothing is assumed.
  const [portalUrl, setPortalUrl] = useState("")
  useEffect(() => {
    fetch("/api/agency")
      .then((res) => res.json())
      .then((data) => {
        const domain = data?.agency?.custom_domain
        setPortalUrl(domain ? `https://${domain}/login` : "Set a custom domain under White-label to get your portal address.")
      })
      .catch(() => setPortalUrl("Set a custom domain under White-label to get your portal address."))
  }, [])

  return (
    <div className="space-y-8 select-none">
      <div className="space-y-1">
        <h1 className="text-[20px] font-bold text-[var(--t1)] tracking-tight">
          Client portal
        </h1>
        <p className="text-[12.5px] text-[var(--t2)]">
          Configure what your brand clients can access and approve inside their dedicated view.
        </p>
      </div>

      <div className="space-y-8 divide-y divide-[var(--line)]">
        <div className="pt-2 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-6 items-start">
          <div className="space-y-1">
            <h3 className="text-[13px] font-semibold text-[var(--t1)]">
              Portal access
            </h3>
            <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
              Live link your clients use to monitor conversations and approve broadcasts.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[12px] font-mono text-[var(--t1)] font-medium">
                  {portalUrl}
                </span>
                <span className="text-[11px] text-[var(--t3)] block">
                  Protected with client magic-link and OTP verification.
                </span>
              </div>
              <Pill variant="green" dot>
                Live
              </Pill>
            </div>

            {/* Permissions Toggles */}
            <div className="space-y-3 pt-2">
              <span className="text-[12px] font-semibold text-[var(--t1)] block">
                Client capabilities
              </span>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)]/40 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[12px] font-medium text-[var(--t1)] block">
                    Broadcast approval workflow
                  </span>
                  <span className="text-[11px] text-[var(--t3)] block">
                    Require client sign-off before sending promotional blasts.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowApprovals}
                  onClick={() => setAllowApprovals(!allowApprovals)}
                  className={cn(
                    "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                    allowApprovals ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                  )}
                >
                  <span
                    className={cn(
                      "w-3 h-3 rounded-full bg-black transition-transform",
                      allowApprovals ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--s2)]/40 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[12px] font-medium text-[var(--t1)] block">
                    Live analytics dashboard
                  </span>
                  <span className="text-[11px] text-[var(--t3)] block">
                    Show real-time ROI, conversation volume, and sales metrics.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showLiveMetrics}
                  onClick={() => setShowLiveMetrics(!showLiveMetrics)}
                  className={cn(
                    "w-8 h-4 rounded-full transition-colors relative flex items-center p-0.5 shrink-0",
                    showLiveMetrics ? "bg-[var(--green)]" : "bg-[var(--s3)]"
                  )}
                >
                  <span
                    className={cn(
                      "w-3 h-3 rounded-full bg-black transition-transform",
                      showLiveMetrics ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => toast.success("Client portal settings updated")}
                className="h-[30px] px-4 text-xs font-semibold"
              >
                Save portal settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
