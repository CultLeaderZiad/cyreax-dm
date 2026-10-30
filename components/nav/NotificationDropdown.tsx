"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Bell, Check, UserCheck, MessageSquare, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n/LanguageContext"

interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string
  link?: string | null
  read_at?: string | null
  created_at: string
}

interface NotificationsResponse {
  notifications: NotificationItem[]
  unread_count: number
}

function formatRelativeTime(dateStr?: string, isAr?: boolean): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ""
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return isAr ? "الآن" : "now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}${isAr ? "د" : "m"}`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}${isAr ? "س" : "h"}`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}${isAr ? "ي" : "d"}`
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function NotificationDropdown() {
  const router = useRouter()
  const { language } = useLanguage()
  const isAr = language === "ar"

  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // SWR refresh every 30s as required
  const { data, mutate } = useSWR<NotificationsResponse>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 }
  )

  const notifications = data?.notifications || []
  const unreadCount = data?.unread_count ?? 0

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  // Mark single notification as read
  const handleItemClick = useCallback(
    async (item: NotificationItem) => {
      setIsOpen(false)
      if (!item.read_at) {
        try {
          await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
          })
          mutate()
        } catch {
          // non-blocking
        }
      }
      if (item.link) {
        router.push(item.link)
      } else {
        router.push("/dashboard/inbox")
      }
    },
    [mutate, router]
  )

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
      mutate()
    } catch {
      // non-blocking
    }
  }, [mutate])

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Trigger Button with Unread Badge */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isAr ? "الإشعارات" : "Notifications"}
        aria-expanded={isOpen}
        className={cn(
          "relative size-7 rounded-[6px] flex items-center justify-center transition-colors cursor-pointer",
          isOpen
            ? "bg-[var(--s3)] text-[var(--t1)]"
            : "text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)]",
          "focus-visible:outline-2 focus-visible:outline-[var(--gold2)]"
        )}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--gold)] text-black text-[10px] font-mono font-bold flex items-center justify-center tabular-nums leading-none shadow-xs pointer-events-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute end-0 bottom-full mb-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-[16px] border border-[var(--line)] bg-[var(--s1)] shadow-[0_20px_40px_rgba(0,0,0,0.6)] text-[var(--t1)] p-2 z-50 select-none animate-in fade-in-50 zoom-in-95 duration-120">
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-2 mb-1 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--t1)]">
                {isAr ? "الإشعارات" : "Notifications"}
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10.5px] font-mono bg-[var(--gold)]/15 text-[var(--gold)] font-medium">
                  {unreadCount} {isAr ? "جديد" : "new"}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-[var(--t3)] hover:text-[var(--gold)] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check className="size-3" />
                <span>{isAr ? "تحديد الكل كمقروء" : "Mark all read"}</span>
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-[var(--line)]/50 scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <MessageSquare className="size-6 text-[var(--t4)] mx-auto mb-2 opacity-50" />
                <p className="text-[12px] font-medium text-[var(--t2)]">
                  {isAr ? "لا توجد إشعارات حتى الآن" : "No notifications yet"}
                </p>
                <p className="text-[11px] text-[var(--t4)] mt-0.5">
                  {isAr
                    ? "ستظهر تنبيهات تسليم المحادثات هنا"
                    : "Handoff and platform alerts appear here"}
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.read_at
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => handleItemClick(notif)}
                    className={cn(
                      "w-full text-start p-2.5 rounded-[10px] transition-colors flex items-start gap-2.5 cursor-pointer my-0.5",
                      isUnread
                        ? "bg-[var(--s2)] hover:bg-[var(--s3)]"
                        : "hover:bg-[var(--s2)]/60 text-[var(--t2)]"
                    )}
                  >
                    <div
                      className={cn(
                        "size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                        isUnread
                          ? "bg-[var(--gold)]/15 text-[var(--gold)]"
                          : "bg-[var(--s3)] text-[var(--t3)]"
                      )}
                    >
                      <UserCheck className="size-3.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={cn(
                            "text-[12px] truncate",
                            isUnread ? "font-semibold text-[var(--t1)]" : "font-medium text-[var(--t2)]"
                          )}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-[var(--t4)] font-mono shrink-0">
                          {formatRelativeTime(notif.created_at, isAr)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--t3)] line-clamp-2 leading-relaxed">
                        {notif.body}
                      </p>
                    </div>

                    {isUnread && (
                      <span className="size-1.5 rounded-full bg-[var(--gold)] shrink-0 self-center" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="pt-1.5 mt-1 border-t border-[var(--line)] px-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  router.push("/dashboard/inbox")
                }}
                className="w-full h-[28px] rounded-[8px] text-[11.5px] font-medium text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{isAr ? "الانتقال إلى صندوق الوارد" : "View all in Inbox"}</span>
                <ExternalLink className="size-3 text-[var(--t3)]" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
