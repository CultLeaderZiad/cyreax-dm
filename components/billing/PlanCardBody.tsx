import Link from "next/link"
import type { ReactNode } from "react"
import { CheckCircle, Star } from "lucide-react"

/**
 * The one plan card face used by the public pricing page, the dashboard
 * Billing page and the choose-a-plan screen, so a plan looks and reads the
 * same everywhere: name, price (and the Egyptian price), every included line,
 * and one clear button.
 */
export function PlanCardBody({
  name,
  description,
  usd,
  egp,
  period,
  lines,
  featured = false,
  cta,
  extra,
  isAr = false,
  trialDays = 0,
  secondary,
}: {
  name: string
  description?: string | null
  usd: number | string | null | undefined
  egp?: string | null
  /** "/mo", "/yr" or "once", already localised. */
  period: string
  lines: string[]
  featured?: boolean
  cta: { label: string; href?: string; onClick?: () => void; disabled?: boolean }
  extra?: ReactNode
  isAr?: boolean
  /** Free-trial length for this plan (set by the admin); 0 hides the line. */
  trialDays?: number
  /** A quieter second action under the button, for example "Subscribe now". */
  secondary?: { label: string; href: string }
}) {
  const muted = featured ? "text-white/80" : "text-neutral-400"
  const button = `block w-full rounded-xl py-3 text-center text-[13px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] ${
    cta.disabled
      ? "cursor-default bg-white/5 text-neutral-500"
      : featured
        ? "bg-[#e5a93c] text-black shadow-lg hover:bg-[#d4952b]"
        : "bg-white/10 text-white hover:bg-white/20"
  }`
  return (
    <>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          {featured && <Star className="size-5 text-[#e5a93c]" />}
          <h3 className={`text-xl font-bold ${featured ? "text-[#e5a93c]" : "text-white"}`}>{name}</h3>
        </div>
        {description && <p className={`text-sm ${muted}`}>{description}</p>}
        <div className="mt-5 flex items-baseline gap-1.5" dir="ltr">
          <span className="font-mono-ui text-5xl font-bold tracking-tight text-white">{usd == null ? "-" : `$${usd}`}</span>
          <span className={`text-sm ${muted}`}>{period}</span>
        </div>
        {egp && (
          <p className={`mt-1.5 text-[13px] ${muted}`} dir="ltr">
            {isAr ? "في مصر: " : "In Egypt: "}
            {egp}
          </p>
        )}
      </div>

      <div className="mb-6 h-px w-full bg-white/10" />

      <ul className="mb-8 flex-1 space-y-3.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-3 text-[14.5px] leading-snug text-white">
            <CheckCircle className={`mt-0.5 size-5 shrink-0 ${featured ? "text-[#e5a93c]" : "text-emerald-400"}`} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {extra}

      {trialDays > 0 && (
        <p className={`mt-5 text-center text-[13px] font-semibold ${featured ? "text-[#e5a93c]" : "text-emerald-400"}`}>
          {isAr ? `تجربة مجانية ${trialDays} أيام` : `${trialDays}-day free trial`}
        </p>
      )}

      {cta.href && !cta.disabled ? (
        <Link href={cta.href} className={`mt-6 ${button}`}>
          {cta.label}
        </Link>
      ) : (
        <button type="button" onClick={cta.onClick} disabled={cta.disabled} className={`mt-6 ${button} cursor-pointer`}>
          {cta.label}
        </button>
      )}

      {secondary && (
        <Link href={secondary.href} className={`mt-3 block text-center text-[13px] underline-offset-4 transition-colors hover:underline ${featured ? "text-white/80 hover:text-white" : "text-neutral-400 hover:text-white"}`}>
          {secondary.label}
        </Link>
      )}
    </>
  )
}
