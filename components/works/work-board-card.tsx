'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Archive, CalendarClock, CalendarDays, GripVertical, Trash2 } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { BoardWorkCard } from '@/lib/works-board'
import {
  BOARD_EASE,
  getDeadlineDaysDelta,
  getDeadlineUrgency,
  type DeadlineUrgency,
} from '@/lib/works-board'
import type { WorkStatus } from '@/lib/work-status'
import { WorkStatusMenu } from '@/components/works/work-status-menu'
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

type IconActionProps = {
  title: string
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}

function IconAction({ title, label, onClick, className, children }: IconActionProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        'border border-accent/20 bg-white/[0.03]',
        'hover:border-accent/40 hover:bg-accent/10',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'touch-manipulation transition-[background-color,border-color,color] duration-200',
        className
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

export function WorkBoardCardContent({
  work,
  href,
  dragging = false,
  pending = false,
  dragHandleProps,
  onReschedule,
  onArchive,
  onDelete,
  onStatusChange,
}: {
  work: BoardWorkCard
  href?: string
  dragging?: boolean
  pending?: boolean
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>
  onReschedule?: (work: BoardWorkCard) => void
  onArchive?: (work: BoardWorkCard) => void
  onDelete?: (work: BoardWorkCard) => void
  onStatusChange?: (work: BoardWorkCard, status: WorkStatus) => void
}) {
  const urgency = getDeadlineUrgency(work.deadline)
  const daysDelta = getDeadlineDaysDelta(work.deadline)
  const styles = urgencyStyles(urgency)
  const showActions = !dragging && (!!onReschedule || !!onArchive || !!onDelete || !!dragHandleProps)

  return (
    <article
      className={cn(
        'rounded-xl border border-accent/20 bg-[#14171c] p-3 shadow-sm',
        'transition-[transform,box-shadow,border-color,background-color,opacity] duration-300',
        dragging
          ? 'border-accent/50 bg-[#1a1f27] shadow-xl shadow-black/40 scale-[1.02] rotate-[0.4deg]'
          : 'hover:border-accent/40 hover:bg-[#171b22]',
        work.isOverdue && 'border-red-500/35',
        pending && 'opacity-60 pointer-events-none'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {dragHandleProps && !dragging ? (
            <button
              type="button"
              title="Trascina"
              aria-label="Trascina lavoro"
              className={cn(
                'mt-0.5 inline-flex h-8 w-7 shrink-0 touch-none items-center justify-center rounded-lg',
                'border border-transparent text-white/35 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/70',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-grab active:cursor-grabbing'
              )}
              {...dragHandleProps}
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}

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
        </div>

        {showActions ? (
          <div className="flex shrink-0 items-center gap-1">
            {onReschedule ? (
              <IconAction
                title="Riprogramma"
                label="Riprogramma consegna"
                onClick={() => onReschedule(work)}
                className="text-accent/90"
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
            ) : null}
            {onArchive ? (
              <IconAction
                title="Segna come Fatto e archivia"
                label="Segna come Fatto e archivia"
                onClick={() => onArchive(work)}
                className="text-emerald-300/90 hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
            ) : null}
            {onDelete ? (
              <IconAction
                title="Elimina lavoro"
                label="Elimina lavoro"
                onClick={() => onDelete(work)}
                className="text-red-300/85 hover:border-red-400/35 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </IconAction>
            ) : null}
          </div>
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

      <WorkStatusMenu
        status={work.status}
        disabled={dragging || !onStatusChange}
        pending={pending}
        onSelect={onStatusChange ? (status) => onStatusChange(work, status) : undefined}
        className="text-[10px] px-1.5 py-0.5"
      />
    </article>
  )
}

export function DraggableWorkBoardCard({
  work,
  href,
  disabled = false,
  columnId,
  pending = false,
  onReschedule,
  onArchive,
  onDelete,
  onStatusChange,
}: {
  work: BoardWorkCard
  href: string
  disabled?: boolean
  /** Colonna di provenienza (userId o status) per il drag & drop. */
  columnId?: string
  pending?: boolean
  onReschedule?: (work: BoardWorkCard) => void
  onArchive?: (work: BoardWorkCard) => void
  onDelete?: (work: BoardWorkCard) => void
  onStatusChange?: (work: BoardWorkCard, status: WorkStatus) => void
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
  }

  return (
    <div ref={setNodeRef} style={style} className="touch-manipulation">
      <WorkBoardCardContent
        work={work}
        href={isDragging ? undefined : href}
        dragging={isDragging}
        pending={pending}
        dragHandleProps={disabled ? undefined : { ...listeners, ...attributes }}
        onReschedule={disabled ? undefined : onReschedule}
        onArchive={disabled ? undefined : onArchive}
        onDelete={disabled ? undefined : onDelete}
        onStatusChange={disabled ? undefined : onStatusChange}
      />
    </div>
  )
}
