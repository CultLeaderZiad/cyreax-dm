"use client"

import { useState, useEffect } from "react"
import { Loader2, CheckCircle, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Inquiry {
  id: string
  full_name: string
  email: string
  company: string | null
  needs_description: string | null
  status: "pending" | "approved" | "rejected"
  admin_note: string | null
  created_at: string
}

export default function AdminEnterprisePage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null)
  const [adminNote, setAdminNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionType, setActionType] = useState<"approved" | "rejected">("approved")

  useEffect(() => {
    fetchInquiries()
  }, [])

  const fetchInquiries = async () => {
    try {
      setError("")
      setLoading(true)
      const res = await fetch("/api/admin/enterprise")
      if (!res.ok) throw new Error("Failed to load inquiries")
      const data = await res.json()
      setInquiries(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openActionDialog = (inquiry: Inquiry, type: "approved" | "rejected") => {
    setSelectedInquiry(inquiry)
    setActionType(type)
    setAdminNote(inquiry.admin_note || "")
    setDialogOpen(true)
  }

  const handleSubmitAction = async () => {
    if (!selectedInquiry) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/enterprise/${selectedInquiry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: actionType, admin_note: adminNote.trim() || null })
      })
      if (!res.ok) throw new Error(`Failed to mark as ${actionType}`)
      setDialogOpen(false)
      fetchInquiries()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Enterprise Inquiries</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Review custom plan requests. Approving doesn't provision anything automatically.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
        </div>
      ) : inquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-12 text-center max-w-xl mx-auto my-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
            <CheckCircle className="w-7 h-7 text-neutral-400" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">No Enterprise Inquiries</h3>
          <p className="text-sm text-neutral-400">
            Enterprise custom plan requests submitted from the public pricing page will appear here for review and follow-up.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {inquiries.map((inq) => (
            <div
              key={inq.id}
              className={`border border-white/10 bg-white/[0.03] rounded-xl p-6 flex flex-col gap-4 ${
                inq.status !== "pending" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white">{inq.full_name}</h3>
                  <p className="text-sm text-neutral-400">{inq.email}</p>
                  {inq.company && <p className="text-xs text-[#e5a93c] mt-1">{inq.company}</p>}
                </div>
                <div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                    inq.status === "pending" ? "bg-blue-500/10 text-blue-400" :
                    inq.status === "approved" ? "bg-green-500/10 text-green-400" :
                    "bg-red-500/10 text-red-400"
                  }`}>
                    {inq.status}
                  </span>
                </div>
              </div>

              {inq.needs_description && (
                <div className="bg-black/30 p-3 rounded-lg border border-white/5 text-sm text-neutral-300">
                  <p className="font-medium text-xs text-neutral-500 mb-1">Needs:</p>
                  {inq.needs_description}
                </div>
              )}

              {inq.admin_note && (
                <div className="bg-[#e5a93c]/5 p-3 rounded-lg border border-[#e5a93c]/10 text-sm text-neutral-300">
                  <p className="font-medium text-xs text-[#e5a93c]/70 mb-1">Admin Note:</p>
                  {inq.admin_note}
                </div>
              )}

              {inq.status === "pending" && (
                <div className="mt-auto flex items-center gap-2 pt-4 border-t border-white/10">
                  <Button
                    onClick={() => openActionDialog(inq, "approved")}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-black"
                    variant="outline"
                  >
                    <CheckCircle className="w-4 h-4 me-2" /> Approve
                  </Button>
                  <Button
                    onClick={() => openActionDialog(inq, "rejected")}
                    className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
                    variant="outline"
                  >
                    <XCircle className="w-4 h-4 me-2" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
          {inquiries.length === 0 && (
            <div className="col-span-full p-12 text-center border border-dashed border-white/10 rounded-xl text-neutral-500">
              No enterprise inquiries yet.
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0B0812] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approved" ? "Approve Inquiry" : "Reject Inquiry"}
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              {actionType === "approved" 
                ? "Marking this as approved indicates you have handled the request. It does not provision anything automatically."
                : "Marking this as rejected."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-neutral-300">Admin Note (optional)</Label>
              <Textarea
                className="bg-white/5 border-white/10 text-white"
                placeholder="Notes for the team..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10 text-neutral-300 hover:bg-white/5">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAction}
              disabled={isSubmitting}
              className={actionType === "approved" ? "bg-green-500 text-black hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"}
            >
              {isSubmitting ? "Saving..." : `Confirm ${actionType}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
