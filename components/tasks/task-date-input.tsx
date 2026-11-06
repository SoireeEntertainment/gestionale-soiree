'use client'

import type { ComponentProps } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Input date del modulo Task con icona calendario bianca affidabile. */
export function TaskDateInput({
  id,
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'task-date-input min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 pr-10 text-sm text-white',
          'focus:outline-none focus:ring-2 focus:ring-accent',
          className
        )}
        {...props}
      />
      <CalendarDays
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
        aria-hidden
      />
    </div>
  )
}
