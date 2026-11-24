import React from "react"
import Link from "next/link"
import Image from "next/image"
import { BRAND } from "@/lib/brand"

export interface BrandLogoProps {
  variant?: "wordmark" | "mark"
  size?: "sm" | "md" | "lg"
  href?: string
  className?: string
  priority?: boolean
  showText?: boolean // compatibility
}

export function BrandLogo({
  variant = "wordmark",
  size = "md",
  href,
  className = "",
  priority = false,
}: BrandLogoProps) {
  const isWordmark = variant === "wordmark"

  const dimensions = {
    sm: isWordmark ? { width: 84, height: 38 } : { width: 22, height: 25 },
    md: isWordmark ? { width: 104, height: 47 } : { width: 28, height: 31 },
    lg: isWordmark ? { width: 132, height: 60 } : { width: 36, height: 40 },
  }[size]

  const textSize = {
    sm: "text-[11px]",
    md: "text-[13px]",
    lg: "text-[15px]",
  }[size]

  const src = isWordmark ? BRAND.logo.wordmark : BRAND.logo.mark

  const content = (
    <div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <Image
        src={src}
        alt={BRAND.name}
        width={dimensions.width}
        height={dimensions.height}
        className="object-contain shrink-0"
        priority={priority}
      />
      {isWordmark && (
        <span className={`text-neutral-300 font-semibold tracking-wide ${textSize} leading-none`}>
          DM
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label={`${BRAND.name} Home`} className="no-underline inline-flex items-center">
        {content}
      </Link>
    )
  }

  return content
}

// Backwards-compatible alias
export default BrandLogo
