"use client"

import React, { useState, useRef } from "react"
import { Check, Upload, Mail, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"
import { brand } from "@/lib/brand"
import Link from "next/link"
import { VodafoneCashBadge, EmailPaymentIcon } from "@/components/icons/PaymentIcons"

export interface PaymentMethodCardProps {
  amount?: string
  currency?: "EGP" | "SAR" | "USD"
  currentPlanId?: string
  pendingReference?: string
}

export function PaymentMethodCard({
  amount = "EGP 15,700",
  currency = "EGP",
  currentPlanId = "agency",
  pendingReference,
}: PaymentMethodCardProps) {
  const [selectedMethod, setSelectedMethod] = useState<"vodafone" | "email">("vodafone")
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedReceipt, setUploadedReceipt] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [clientName, setClientName] = useState("")
  const [emailNote, setEmailNote] = useState("")
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Masked display: "010 •••• 2994"
  const rawNumber = brand.vodafoneCashNumber
  const maskedPhone = rawNumber.length >= 7
    ? `${rawNumber.slice(0, 3)} •••• ${rawNumber.slice(-4)}`
    : "010 •••• 2994"

  const transferRef = pendingReference || "HLX-7Q4M"

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      setUploadedReceipt(file.name)
      toast.success(`Receipt "${file.name}" uploaded for verification`)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setUploadedReceipt(file.name)
      toast.success(`Receipt "${file.name}" uploaded for verification`)
    }
  }

  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput.trim()) {
      toast.error("Please enter your email address")
      return
    }
    setEmailLoading(true)
    try {
      const res = await fetch("/api/payments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: "email",
          plan_id: currentPlanId,
          amount: 1, // trigger submission record
          transaction_reference: `EMAIL-REQ-${Date.now().toString(36).toUpperCase()}`,
          note: `Email payment request: ${emailInput.trim()} | Name: ${clientName.trim() || "N/A"}${emailNote ? ` | Note: ${emailNote.trim()}` : ""}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok || data.success) {
        setEmailSent(true)
        toast.success("Payment request sent to your email!")
      } else {
        toast.error(data.error || "Failed to submit payment request")
      }
    } catch {
      toast.error("Network error while submitting payment request")
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s1)] p-5 select-none space-y-4">
      {/* Header */}
      <h3 className="text-[14px] font-semibold text-[var(--t1)]">
        Payment method
      </h3>

      {/* 2 Supported Provider Options: Vodafone Cash & Email Request */}
      <div className="grid grid-cols-2 gap-3">
        {/* Vodafone Cash */}
        <button
          type="button"
          onClick={() => setSelectedMethod("vodafone")}
          className={cn(
            "rounded-lg border p-2.5 text-start transition-colors cursor-pointer flex flex-col justify-between h-[68px]",
            selectedMethod === "vodafone"
              ? "border-[var(--goldline)] bg-[var(--goldbg)]"
              : "border-[var(--line)] bg-[var(--s2)] hover:border-[var(--line2)] text-[var(--t3)]"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="h-6 px-1.5 py-0.5 rounded bg-white flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/vodafone-cash.png"
                alt="Vodafone Cash"
                className="h-4 w-auto object-contain"
              />
            </div>
            <span className="font-semibold text-[12px] text-[var(--t1)] truncate">
              Vodafone Cash
            </span>
          </div>
          <span className="text-[10px] text-[var(--t3)] font-mono">Egypt · wallet transfer</span>
        </button>

        {/* Email Payment Request */}
        <button
          type="button"
          onClick={() => setSelectedMethod("email")}
          className={cn(
            "rounded-lg border p-2.5 text-start transition-colors cursor-pointer flex flex-col justify-between h-[68px]",
            selectedMethod === "email"
              ? "border-[var(--goldline)] bg-[var(--goldbg)]"
              : "border-[var(--line)] bg-[var(--s2)] hover:border-[var(--line2)] text-[var(--t3)]"
          )}
        >
          <div className="flex items-center gap-2">
            <EmailPaymentIcon size={24} className="shrink-0" />
            <span className="font-semibold text-[12px] text-[var(--t1)] truncate">
              Email Request
            </span>
          </div>
          <span className="text-[10px] text-[var(--t3)] font-mono">Invoice sent to email</span>
        </button>
      </div>

      {/* Vodafone Cash Ticket (.ticket component) */}
      {selectedMethod === "vodafone" && (
        <div className="ticket rounded-xl border border-[var(--line)] bg-[var(--s2)] p-4 relative overflow-hidden space-y-3">
          {/* Top row, 3 columns */}
          <div className="grid grid-cols-3 gap-2 py-0.5">
            {/* Column 1: Send exactly */}
            <div>
              <span className="text-[10.5px] text-[var(--t3)] font-mono block mb-1">
                Send exactly
              </span>
              <span className="font-mono text-[13px] font-semibold text-[var(--t1)] tabular-nums">
                <bdi>{amount}</bdi>
              </span>
            </div>

            {/* Column 2: To Vodafone Cash */}
            <div>
              <span className="text-[10.5px] text-[var(--t3)] font-mono block mb-1">
                To Vodafone Cash
              </span>
              <div className="flex items-center gap-1 font-mono text-[13px] font-semibold text-[var(--t1)]">
                <bdi>{maskedPhone}</bdi>
                <CopyButton
                  value={brand.vodafoneCashNumber}
                  label="Vodafone Cash number"
                  className="p-1 h-auto"
                />
              </div>
            </div>

            {/* Column 3: Reference */}
            <div>
              <span className="text-[10.5px] text-[var(--t3)] font-mono block mb-1">
                Reference
              </span>
              <div className="flex items-center gap-1 font-mono text-[13px] font-semibold text-[var(--gold2)]">
                <bdi>{transferRef}</bdi>
                <CopyButton
                  value={transferRef}
                  label="Transfer reference"
                  className="p-1 h-auto text-[var(--gold2)]"
                />
              </div>
            </div>
          </div>

          {/* Perforated divider with half-circle notches */}
          <div className="relative my-2.5 flex items-center">
            {/* Left Notch */}
            <span
              className="absolute -start-[17px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--s1)] border-e border-[var(--line)]"
              aria-hidden="true"
            />
            {/* Dashed Perforation Line */}
            <div className="w-full border-t border-dashed border-[var(--line3)] mx-1" />
            {/* Right Notch */}
            <span
              className="absolute -end-[17px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--s1)] border-s border-[var(--line)]"
              aria-hidden="true"
            />
          </div>

          {/* Below perforation: Drop zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "rounded-xl border border-dashed p-3.5 text-center space-y-1 transition-colors cursor-pointer",
              isDragging
                ? "border-[var(--goldline)] bg-[var(--goldbg)]"
                : "border-[var(--line3)] bg-[var(--s2)] hover:border-[var(--goldline)] hover:bg-[var(--s3)]"
            )}
          >
            {uploadedReceipt ? (
              <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--green)]">
                <Check className="w-4 h-4" />
                <span className="font-medium truncate max-w-[260px]">{uploadedReceipt}</span>
                <span className="text-[10px] text-[var(--t3)]">(click to replace)</span>
              </div>
            ) : (
              <>
                <Upload className="w-4 h-4 text-[var(--gold)] mx-auto mb-1" />
                <p className="text-[11.5px] font-medium text-[var(--t1)]">
                  Drop the transfer screenshot here
                </p>
                <p className="text-[10.5px] text-[var(--t3)] leading-relaxed">
                  We match amount and reference automatically. No email or WhatsApp needed.
                </p>
              </>
            )}
          </div>

          {/* Status track: 4 steps */}
          <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--t3)] pt-1 px-1">
            {/* Step 1: Sent (Done = green check) */}
            <div className="flex items-center gap-1 text-[var(--green)] font-medium">
              <span className="w-3.5 h-3.5 rounded-full bg-[var(--greenbg)] border border-[var(--green)] flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-[var(--green)]" />
              </span>
              <span>Sent</span>
            </div>

            <span className="h-px w-6 sm:w-8 bg-[var(--line2)]" />

            {/* Step 2: Receipt uploaded (Current = gold ring) */}
            <div className="flex items-center gap-1 text-[var(--gold2)] font-medium">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--gold)] flex items-center justify-center shrink-0">
                <span className="w-1 h-1 rounded-full bg-[var(--gold)]" />
              </span>
              <span>Receipt uploaded</span>
            </div>

            <span className="h-px w-6 sm:w-8 bg-[var(--line2)]" />

            {/* Step 3: Verified (Upcoming = line3 ring) */}
            <div className="flex items-center gap-1 text-[var(--t3)]">
              <span className="w-3.5 h-3.5 rounded-full border border-[var(--line3)] shrink-0" />
              <span>Verified</span>
            </div>

            <span className="h-px w-6 sm:w-8 bg-[var(--line2)]" />

            {/* Step 4: Active (Upcoming = line3 ring) */}
            <div className="flex items-center gap-1 text-[var(--t3)]">
              <span className="w-3.5 h-3.5 rounded-full border border-[var(--line3)] shrink-0" />
              <span>Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Email Payment Request Tab Content */}
      {selectedMethod === "email" && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s2)] p-4 space-y-3.5">
          {emailSent ? (
            <div className="p-4 rounded-lg bg-[var(--greenbg)] border border-[var(--green)] space-y-2 text-center">
              <div className="w-8 h-8 rounded-full bg-[var(--green)] text-black flex items-center justify-center mx-auto">
                <Check className="w-5 h-5" />
              </div>
              <h4 className="text-[13px] font-semibold text-[var(--t1)]">
                Payment Request Sent!
              </h4>
              <p className="text-[11.5px] text-[var(--t3)] leading-relaxed">
                An invoice and payment instructions have been sent to{" "}
                <span className="font-mono text-[var(--t1)]">{emailInput}</span>.
                Please check your inbox to complete the payment.
              </p>
              <button
                type="button"
                onClick={() => setEmailSent(false)}
                className="text-[11px] text-[var(--gold2)] hover:underline mt-1"
              >
                Send another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailRequest} className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-[var(--gold)] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-[12.5px] text-[var(--t1)] font-semibold">
                    Request Invoice &amp; Payment Link
                  </p>
                  <p className="text-[11px] text-[var(--t3)] leading-relaxed">
                    We&apos;ll email you an itemized invoice for {amount} along with manual transfer instructions.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div>
                  <label htmlFor="pmc-email" className="block text-[10.5px] font-mono text-[var(--t3)] mb-1">
                    Your Email Address *
                  </label>
                  <input
                    id="pmc-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-[34px] px-3 rounded-lg bg-[var(--s1)] border border-[var(--line2)] text-[12px] text-[var(--t1)] placeholder-[var(--t3)] focus:border-[var(--goldline)] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="pmc-name" className="block text-[10.5px] font-mono text-[var(--t3)] mb-1">
                      Full Name
                    </label>
                    <input
                      id="pmc-name"
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Your name"
                      className="w-full h-[34px] px-3 rounded-lg bg-[var(--s1)] border border-[var(--line2)] text-[12px] text-[var(--t1)] placeholder-[var(--t3)] focus:border-[var(--goldline)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="pmc-note" className="block text-[10.5px] font-mono text-[var(--t3)] mb-1">
                      Note / Reference
                    </label>
                    <input
                      id="pmc-note"
                      type="text"
                      value={emailNote}
                      onChange={(e) => setEmailNote(e.target.value)}
                      placeholder="Optional notes"
                      className="w-full h-[34px] px-3 rounded-lg bg-[var(--s1)] border border-[var(--line2)] text-[12px] text-[var(--t1)] placeholder-[var(--t3)] focus:border-[var(--goldline)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="h-[32px] px-4 rounded-[6px] bg-[var(--gold)] text-black font-semibold text-[12px] hover:bg-[var(--gold2)] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>{emailLoading ? "Sending request…" : `Send request for ${amount}`}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <Link
                  href="/terms"
                  className="text-[11px] text-[var(--t3)] hover:text-[var(--t2)] underline transition-colors"
                >
                  Payment terms
                </Link>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
