"use client"

import { forwardRef, useState } from "react"
import type { InputHTMLAttributes } from "react"

/**
 * Password input with a show/hide toggle ("eye") on the right side.
 *
 * The input uses a dark-theme style by default. Pass a `className` to override
 * the full input styling (e.g. for light-theme forms) — be sure to include
 * `pe-10` so the toggle never overlaps the text.
 */
type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>

const DEFAULT_INPUT_CLASS =
  "relative block w-full rounded-md border border-white/20 bg-white/5 py-1.5 px-3 pe-10 text-white placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-[var(--gold,#D6AE5C)] sm:text-sm sm:leading-6"

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false)

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={className ?? DEFAULT_INPUT_CLASS}
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 end-0 z-20 flex items-center pe-3 text-gray-400 hover:opacity-80 focus:outline-none focus-visible:text-white"
        >
          {visible ? (
            <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c4.5 0 8 3.6 10 7-.6 1-1.3 2-2.2 2.9" />
              <path d="M6.6 6.6C4.5 8 2.8 10 2 12c2 3.4 5.5 7 10 7a10.9 10.9 0 0 0 4.5-.9" />
            </svg>
          ) : (
            <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    )
  }
)