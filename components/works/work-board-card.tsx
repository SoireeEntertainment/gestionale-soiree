'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarClock, CalendarDays } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { BoardWorkCard } from '@/lib/works-board'
import {
  BOARD_EASE,
  getDeadlineDaysDelta,
  getDeadlineUrgency,
  type DeadlineUrgency,
} from '@/lib/works-board'
import { WorkStatusBadge } from '@/components/works/work-status-badge'
import { cn } from '@/lib/utils'

function formatDeadlineShort(deadline: string | null): string {
  if (!deadline) return 'Senza scadenza'
  try {
    return format(parseISO(deadline), 'dd MMM yyyy', { locale: it }).toUpperCase()
  } catch {
    return deadline
  }
}

function urgencyStyles(urgency: DeadlineUrgency): { wrap: string; text: string } {
  switch (urgency) {
    case 'overdue':
      return { wrap: 'bg-red-500/10 border-red-500/25', text: 'text-red-300' }
    case 'today':
      return { wrap: 'bg-rose-500/10 border-rose-400/30', text: 'text-rose-300' }
    case 'soon':
      return { wrap: 'bg-amber-500/10 border-amber-400/25', text: 'text-amber-200' }
    case 'later':
      return { wrap: 'bg-accent/10 border-accent/20', text: 'text-accent' }
    default:
      return { wrap: 'bg-white/[0.04] border-white/10', text: 'text-white/45' }
  }
}

function urgencyLabel(urgency: DeadlineUrgency, daysDelta: number | null): string {
  if (urgency === 'none') return 'Nessuna data'
  if (urgency === 'overdue' && daysDelta != null) {
    const days = Math.abs(daysDelta)
    return days === 1 ? 'Scaduto da 1 giorno' : `Scaduto da ${days} giorni`
  }
  if (urgency === 'today') return 'Scade oggi'
  if (urgency === 'soon' && daysDelta != null) {
    return daysDelta === 1 ? 'Tra 1 giorno' : `Tra ${daysDelta} giorni`
  }
  return 'Consegna'
}

export function WorkBoardCardContent({
  work,
  href,
  dragging = false,
  onReschedule,
}: {
  work: BoardWorkCard
  href?: string
  dragging?: boolean
  onReschedule?: (work: BoardWorkCard) => void
}) {
  const urgency = getDeadlineUrgency(work.deadline)
  const daysDelta = getDeadlineDaysDelta(work.deadline)
  const styles = urgencyStyles(urgency)

  const body = (
    <article
      className={cn(
        'rounded-xl border border-accent/20 bg-[#14171c] p-3 shadow-sm',
        'transition-[transform,box-shadow,border-color,background-color,opacity] duration-300',
        dragging
          ? 'border-accent/50 bg-[#1a1f27] shadow-xl shadow-black/40 scale-[1.02] rotate-[0.4deg]'
          : 'hover:border-accent/40 hover:bg-[#171b22]',
        work.isOverdue && 'border-red-500/35'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        {href && !dragging ? (
          <Link
            href={href}
            className="min-w-0 text-sm font-semibold leading-snug text-white line-clamp-2 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {work.title}
          </Link>
        ) : (
          <h3 className="min-w-0 text-sm font-semibold leading-snug text-white line-clamp-2">
            {work.title}
          </h3>
        )}
        {onReschedule && !dragging ? (
          <button
            type="button"
            title="Riprogramma"
            aria-label="Riprogramma consegna"
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              'border border-accent/20 bg-white/[0.03] text-accent/90',
              'hover:border-accent/40 hover:bg-accent/10',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'touch-manipulation'
            )}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onReschedule(work)
            }}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <p className="mb-2 truncate text-[11px] text-white/45">
        <span className="text-white/60">{work.clientName}</span>
        <span className="text-white/25"> · </span>
        {work.categoryName}
      </p>

      <div
        className={cn(
          'mb-2 flex items-start gap-2 rounded-lg border px-2 py-1.5',
          styles.wrap
        )}
      >
        <CalendarDays className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', styles.text)} aria-hidden />
        <div className="min-w-0">
          <p className={cn('text-[10px] font-medium uppercase tracking-wide', styles.text)}>
            {urgencyLabel(urgency, daysDelta)}
          </p>
          <p className={cn('text-[13px] font-bold leading-tight tracking-wide', styles.text)}>
            {formatDeadlineShort(work.deadline)}
          </p>
        </div>
      </div>

      <WorkStatusBadge status={work.status} className="text-[10px] px-1.5 py-0.5" />
    </article>
  )

  return body
}

export function DraggableWorkBoardCard({
  work,
  href,
  disabled = false,
  columnId,
  onReschedule,
}: {
  work: BoardWorkCard
  href: string
  disabled?: boolean
  /** Colonna di provenienza (userId o status) per il drag & drop. */
  columnId?: string
  onReschedule?: (work: BoardWorkCard) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${columnId ?? 'board'}:${work.id}`,
    data: { work, columnId, workId: work.id },
    disabled,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : `transform 280ms ${BOARD_EASE}`,
    opacity: isDragging ? 0.35 : 1,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
    touchAction: 'none' as const,
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none">
      <WorkBoardCardContent
        work={work}
        href={isDragging ? undefined : href}
        dragging={isDragging}
        onReschedule={disabled ? undefined : onReschedule}
      />
    </div>
  )
}
