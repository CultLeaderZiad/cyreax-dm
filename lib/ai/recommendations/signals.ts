/**
 * Recommendation cards computed from real account data. Pure functions: the
 * numbers come from what was measured, never from a model. (A model may only
 * write the one-paragraph summary on top, from these same numbers.)
 */

export type Severity = "high" | "medium" | "info"

export interface Recommendation {
  key: string
  severity: Severity
  title: { en: string; ar: string }
  detail: { en: string; ar: string }
  /** The measured numbers behind the card. */
  evidence: Record<string, number>
  action: { href: string; label: { en: string; ar: string } }
}

export interface SignalInput {
  now: number
  conversations: Array<{ lastMessageAt: string | null; lastIsInbound: boolean }>
  automations: Array<{ id: string; name: string; isActive: boolean; createdAt: string; events14d: number }>
  sentiment: { positive: number; neutral: number; negative: number }
  usage: Array<{ metric: "aiReplies" | "contacts" | "channels"; used: number; limit: number }>
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const METRIC_LABEL = {
  aiReplies: { en: "AI replies this month", ar: "ردود الذكاء الاصطناعي هذا الشهر" },
  contacts: { en: "contacts", ar: "جهات الاتصال" },
  channels: { en: "channels", ar: "القنوات" },
} as const

export function computeRecommendations(input: SignalInput): Recommendation[] {
  const out: Recommendation[] = []

  const unanswered = input.conversations.filter((c) => {
    if (!c.lastIsInbound || !c.lastMessageAt) return false
    const age = input.now - Date.parse(c.lastMessageAt)
    return age > DAY && age < 14 * DAY
  }).length
  if (unanswered > 0) {
    out.push({
      key: "unanswered_conversations",
      severity: unanswered >= 5 ? "high" : "medium",
      title: { en: `${unanswered} customer${unanswered === 1 ? "" : "s"} waiting over 24 hours`, ar: `${unanswered} عميل ينتظر الرد أكثر من 24 ساعة` },
      detail: {
        en: "Their last message has no reply. Answer them or add an automation for the question they ask.",
        ar: "آخر رسالة منهم بدون رد. ردّ عليهم أو أضف أتمتة للسؤال المتكرر.",
      },
      evidence: { unanswered },
      action: { href: "/dashboard/inbox", label: { en: "Open inbox", ar: "افتح الرسائل" } },
    })
  }

  const active = input.automations.filter((a) => a.isActive)
  if (active.length === 0) {
    out.push({
      key: "no_active_automation",
      severity: "high",
      title: { en: "No automation is running", ar: "لا توجد أي أتمتة شغّالة" },
      detail: { en: "Nothing replies to comments or messages automatically right now.", ar: "لا شيء يرد على التعليقات أو الرسائل تلقائيًا الآن." },
      evidence: { active: 0 },
      action: { href: "/dashboard/automations", label: { en: "Create an automation", ar: "أنشئ أتمتة" } },
    })
  } else {
    const idle = active.filter((a) => a.events14d === 0 && input.now - Date.parse(a.createdAt) > 14 * DAY)
    if (idle.length > 0) {
      out.push({
        key: "idle_automations",
        severity: "medium",
        title: { en: `${idle.length} automation${idle.length === 1 ? "" : "s"} did not trigger in 14 days`, ar: `${idle.length} أتمتة لم تعمل خلال 14 يومًا` },
        detail: {
          en: `Check the trigger or the post it is tied to: ${idle.slice(0, 3).map((a) => a.name).join(", ")}.`,
          ar: `راجع الكلمة المفتاحية أو المنشور المرتبط: ${idle.slice(0, 3).map((a) => a.name).join("، ")}.`,
        },
        evidence: { idle: idle.length, active: active.length },
        action: { href: "/dashboard/automations", label: { en: "Review automations", ar: "راجع الأتمتة" } },
      })
    }
  }

  const analysed = input.sentiment.positive + input.sentiment.neutral + input.sentiment.negative
  const negativeShare = analysed > 0 ? input.sentiment.negative / analysed : 0
  if (analysed >= 10 && negativeShare >= 0.25) {
    const pct = Math.round(negativeShare * 100)
    out.push({
      key: "negative_sentiment",
      severity: negativeShare >= 0.4 ? "high" : "medium",
      title: { en: `${pct}% of analysed comments are negative`, ar: `${pct}% من التعليقات التي تم تحليلها سلبية` },
      detail: { en: "Look at what people complain about and answer it in a post or an automatic reply.", ar: "اطّلع على ما يشتكون منه وردّ عليه في منشور أو برد تلقائي." },
      evidence: { negative: input.sentiment.negative, analysed, pct },
      action: { href: "/dashboard/analytics", label: { en: "Open analytics", ar: "افتح التحليلات" } },
    })
  }

  for (const u of input.usage) {
    if (u.limit <= 0) continue
    const ratio = u.used / u.limit
    if (ratio < 0.8) continue
    const pct = Math.min(100, Math.round(ratio * 100))
    out.push({
      key: `usage_${u.metric}`,
      severity: ratio >= 1 ? "high" : "medium",
      title: { en: `${pct}% of your ${METRIC_LABEL[u.metric].en} limit is used`, ar: `استهلكت ${pct}% من حد ${METRIC_LABEL[u.metric].ar}` },
      detail: { en: `${u.used} of ${u.limit}. Upgrade before it stops your automations.`, ar: `${u.used} من ${u.limit}. رقّ خطتك قبل أن تتوقف الأتمتة.` },
      evidence: { used: u.used, limit: u.limit, pct },
      action: { href: "/dashboard/billing", label: { en: "See plans", ar: "شاهد الخطط" } },
    })
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

/** Day key for daily plans, ISO-week key for weekly plans. */
export function periodKey(level: "daily" | "weekly", now: Date): string {
  if (level === "daily") return now.toISOString().slice(0, 10)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}
