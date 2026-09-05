'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type HelpTooltipProps = {
  label: string
  content: string
  className?: string
}

/**
 * Icona "?" discreta con tooltip dark (hover, focus tastiera, tap su mobile).
 */
export function HelpTooltip({ label, content, className }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      className={cn('relative inline-flex align-middle', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          'border border-current text-[10px] font-semibold leading-none',
          'text-white/40 hover:text-accent focus-visible:text-accent',
          'cursor-help outline-none focus-visible:ring-1 focus-visible:ring-accent/50'
        )}
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            ;(e.currentTarget as HTMLButtonElement).blur()
          }
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className={cn(
            'absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2',
            'rounded-md border border-white/15 bg-dark/95 px-3 py-2',
            'text-left text-xs font-normal leading-snug text-white/85 shadow-lg backdrop-blur-sm',
            'pointer-events-none'
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
