import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] text-[12.5px] font-medium transition-colors duration-120 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-[var(--t1)] focus-visible:outline-offset-2 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--t1)] text-[var(--bg)] hover:opacity-90 shadow-none active:translate-y-0',
        default:
          'bg-[var(--s2)] text-[var(--t1)] border border-[var(--line2)] hover:bg-[var(--s3)] hover:text-[var(--t1)]',
        outline:
          'bg-[var(--s2)] text-[var(--t1)] border border-[var(--line2)] hover:bg-[var(--s3)]',
        secondary:
          'bg-[var(--s2)] text-[var(--t1)] border border-[var(--line2)] hover:bg-[var(--s3)]',
        ghost:
          'text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s3)]',
        destructive:
          'bg-[rgba(242,85,90,0.10)] text-[var(--red)] border border-[rgba(242,85,90,0.22)] hover:bg-[rgba(242,85,90,0.18)]',
        gold:
          'bg-[var(--gold)] text-[#0B0B0D] hover:bg-[var(--gold2)] font-semibold',
        link: 'text-[var(--t1)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-[30px] px-3',
        sm: 'h-[26px] px-2.5 text-[11.5px]',
        lg: 'h-[34px] px-4 text-[13px]',
        icon: 'size-[30px]',
        'icon-sm': 'size-[26px]',
        'icon-lg': 'size-[34px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/**
 * HoldToConfirm button for destructive actions.
 * Fills red over 900ms, then invokes onConfirm with optional 5s undo toast.
 */
interface HoldToConfirmProps extends Omit<React.ComponentProps<'button'>, 'onConfirm'> {
  onConfirm: () => void
  label: string
  confirmingLabel?: string
  undoMessage?: string
  onUndo?: () => void
}

function HoldToConfirm({
  onConfirm,
  label,
  confirmingLabel = "Holding to delete...",
  undoMessage,
  onUndo,
  className,
  ...props
}: HoldToConfirmProps) {
  const [holding, setHolding] = React.useState(false)
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)

  const startHold = () => {
    setHolding(true)
    timerRef.current = setTimeout(() => {
      setHolding(false)
      onConfirm()
      if (undoMessage && onUndo) {
        toast.info(undoMessage, {
          action: {
            label: "Undo",
            onClick: () => onUndo(),
          },
          duration: 5000,
        })
      }
    }, 900)
  }

  const cancelHold = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setHolding(false)
  }

  return (
    <button
      type="button"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      className={cn(
        "relative overflow-hidden h-[30px] px-3 rounded-[6px] text-[12.5px] font-medium border border-[rgba(242,85,90,0.25)] text-[var(--red)] bg-[rgba(242,85,90,0.10)] select-none transition-colors",
        className
      )}
      {...props}
    >
      <span
        className="absolute inset-0 bg-[var(--red)]/30 transition-transform origin-left"
        style={{
          transform: holding ? 'scaleX(1)' : 'scaleX(0)',
          transitionDuration: holding ? '900ms' : '150ms',
          transitionTimingFunction: 'linear',
        }}
      />
      <span className="relative z-10">{holding ? confirmingLabel : label}</span>
    </button>
  )
}

export { Button, buttonVariants, HoldToConfirm }

