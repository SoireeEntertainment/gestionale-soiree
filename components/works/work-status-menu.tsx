'use client'

import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getWorkStatusMeta, type WorkStatus } from '@/lib/work-status'
import { WORK_BOARD_QUICK_STATUSES } from '@/lib/work-board-quick-actions'
import { BOARD_EASE } from '@/lib/works-board'
import { cn } from '@/lib/utils'

export function WorkStatusMenu({
  status,
  disabled = false,
  pending = false,
  onSelect,
  className,
}: {
  status: string
  disabled?: boolean
  pending?: boolean
  onSelect?: (status: WorkStatus) => void
  className?: string
}) {
  const meta = getWorkStatusMeta(status)
  const current = status.toUpperCase()

  if (disabled || !onSelect) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
          meta.badgeClassName,
          className
        )}
      >
        {meta.label}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Stato lavoro: ${meta.label}. Cambia stato`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
            'transition-[background-color,border-color,opacity,transform] duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-[#14171c]',
            'hover:brightness-110 disabled:opacity-60 touch-manipulation',
            meta.badgeClassName,
            className
          )}
          style={{ transitionTimingFunction: BOARD_EASE }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{meta.label}</span>
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[200px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {WORK_BOARD_QUICK_STATUSES.map((value) => {
          const itemMeta = getWorkStatusMeta(value)
          const selected = current === value
          return (
            <DropdownMenuItem
              key={value}
              className={cn(selected && 'bg-accent/15 text-accent')}
              onSelect={(e) => {
                e.preventDefault()
                if (selected) return
                onSelect(value)
              }}
            >
              <span
                className={cn(
                  'inline-flex h-2.5 w-2.5 shrink-0 rounded-full border',
                  itemMeta.badgeClassName
                )}
                aria-hidden
              />
              <span className="flex-1">{itemMeta.label}</span>
              {selected ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
