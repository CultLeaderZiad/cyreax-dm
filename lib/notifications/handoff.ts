import { BRAND } from "@/lib/brand"
import { sendEmail } from "@/lib/email-provider"
import { generateEmailHtml } from "@/lib/email-templates"

export const HANDOFF_DEDUPE_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

// In-memory deduplication cache for sub-second and fast in-process turns
const recentHandoffCache = new Map<string, number>()

export function clearHandoffCache(): void {
  recentHandoffCache.clear()
}

export function isHandoffDuplicate(
  conversationKey: string,
  options?: {
    cache?: Map<string, number>
    now?: number
    windowMs?: number
  }
): boolean {
  if (!conversationKey) return false
  const cache = options?.cache || recentHandoffCache
  const now = options?.now ?? Date.now()
  const windowMs = options?.windowMs ?? HANDOFF_DEDUPE_WINDOW_MS

  const lastTime = cache.get(conversationKey)
  if (!lastTime) return false
  return now - lastTime < windowMs
}

export function recordHandoff(
  conversationKey: string,
  options?: {
    cache?: Map<string, number>
    now?: number
  }
): void {
  if (!conversationKey) return
  const cache = options?.cache || recentHandoffCache
  const now = options?.now ?? Date.now()
  cache.set(conversationKey, now)
}

export interface NotifyHandoffOptions {
  supabase: any
  workspaceId?: string | null
  accountId?: string | null
  contactName?: string | null
  channel?: string | null
  reason?: string | null
  conversationId?: string | null
}

export interface NotifyHandoffResult {
  skipped: boolean
  notificationId?: string
  emailSent?: boolean
  reason?: string
  error?: string
}

/**
 * Checks if a database error is due to a missing table/column (e.g. migration pending).
 */
function isMissingTableError(error: any): boolean {
  if (!error) return false
  const msg = String(error.message || "")
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(msg)
  )
}

/**
 * Notifies the workspace owner / team when the AI agent pauses and hands off to human:
 * 1. Skips duplicates for the same conversation within 30 minutes.
 * 2. Inserts an in-app notification row into the `notifications` table.
 * 3. Checks notification preferences on the user's account and dispatches an email via nodemailer.
 */
export async function notifyHandoff({
  supabase,
  workspaceId,
  accountId,
  contactName,
  channel,
  reason,
  conversationId,
}: NotifyHandoffOptions): Promise<NotifyHandoffResult> {
  const convKey = conversationId
    ? `conv:${conversationId}`
    : workspaceId && channel && contactName
      ? `ws:${workspaceId}:${channel}:${contactName}`
      : ""

  const now = Date.now()

  // 1. In-memory dedupe check
  if (convKey && isHandoffDuplicate(convKey, { now, windowMs: HANDOFF_DEDUPE_WINDOW_MS })) {
    return { skipped: true, reason: "duplicate_in_memory" }
  }

  // 2. Database dedupe check (within 30 minutes)
  if (conversationId && supabase) {
    try {
      const thirtyMinutesAgo = new Date(now - HANDOFF_DEDUPE_WINDOW_MS).toISOString()
      let query = supabase
        .from("notifications")
        .select("id, created_at")
        .eq("kind", "handoff")
        .ilike("link", `%${conversationId}%`)
        .gte("created_at", thirtyMinutesAgo)

      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId)
      }

      const { data: recent, error: dedupeError } = await query.limit(1)
      if (!dedupeError && recent && recent.length > 0) {
        if (convKey) recordHandoff(convKey, { now: new Date(recent[0].created_at).getTime() })
        return { skipped: true, reason: "duplicate_in_db" }
      }
    } catch {
      // Non-blocking if table not yet migrated
    }
  }

  // Record this attempt immediately to guard against concurrent turns
  if (convKey) {
    recordHandoff(convKey, { now })
  }

  const effectiveName = contactName || "Customer"
  const effectiveChannel = channel ? channel.toUpperCase() : "DM"
  const effectiveReason = reason || "AI handoff requested"
  const link = conversationId
    ? `/dashboard/inbox?c=${conversationId}`
    : `/dashboard/inbox`

  let notificationId: string | undefined

  // 3. Insert notification row into `notifications` table
  if (supabase) {
    try {
      const { data: inserted, error: insertError } = await supabase
        .from("notifications")
        .insert({
          workspace_id: workspaceId || null,
          account_id: accountId || null,
          kind: "handoff",
          title: `Handoff requested: ${effectiveName}`,
          body: `${effectiveName} on ${effectiveChannel} needs human assistance (${effectiveReason}).`,
          link,
          read_at: null,
          created_at: new Date(now).toISOString(),
        })
        .select("id")
        .maybeSingle()

      if (insertError) {
        if (!isMissingTableError(insertError)) {
          console.warn("[notifyHandoff] DB insert error:", insertError.message)
        }
      } else if (inserted?.id) {
        notificationId = String(inserted.id)
      }
    } catch (err: any) {
      console.warn("[notifyHandoff] DB insert exception:", err?.message)
    }
  }

  // 4. Resolve account for notification settings & email delivery
  let emailSent = false
  if (supabase) {
    try {
      let targetAccountId = accountId

      // If accountId is not provided, try resolving from workspace owner
      if (!targetAccountId && workspaceId) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("owner_account_id")
          .eq("id", workspaceId)
          .maybeSingle()
        if (ws?.owner_account_id) {
          targetAccountId = ws.owner_account_id
        }
      }

      if (targetAccountId) {
        const { data: account } = await supabase
          .from("accounts")
          .select("email, notification_settings")
          .eq("id", targetAccountId)
          .maybeSingle()

        if (account?.email) {
          const settings = account.notification_settings || {}

          // Default to true if not explicitly set to false
          const emailAllowed =
            settings.email_alerts !== false && settings.handoff_alerts !== false

          if (emailAllowed) {
            const html = generateEmailHtml({
              template: "announcement",
              subject: `[Action Required] AI Handoff: ${effectiveName} (${effectiveChannel})`,
              heading: "Human Handoff Alert",
              subheading: `The AI agent paused automated replies and needs human intervention on ${effectiveChannel}.`,
              bodyText: `A conversation with ${effectiveName} requires human attention.\n\nChannel: ${effectiveChannel}\nReason: ${effectiveReason}`,
              ctaText: "Open Conversation",
              ctaUrl: `${BRAND.appUrl}${link}`,
            })

            const sendResult = await sendEmail({
              to: account.email,
              subject: `[Action Required] AI Handoff: ${effectiveName} (${effectiveChannel})`,
              html,
            })

            emailSent = Boolean(sendResult?.success)
          }
        }
      }
    } catch (emailErr: any) {
      console.warn("[notifyHandoff] Email sending exception:", emailErr?.message)
    }
  }

  return {
    skipped: false,
    notificationId,
    emailSent,
  }
}
