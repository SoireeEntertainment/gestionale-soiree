'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { BoardWorkCard } from '@/lib/works-board'
import { BOARD_EASE } from '@/lib/works-board'
import { WorkStatusBadge } from '@/components/works/work-status-badge'
import { cn } from '@/lib/utils'

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Senza scadenza'
  try {
    return format(parseISO(deadline), 'd MMM yyyy', { locale: it })
  } catch {
    return deadline
  }
}

export function WorkBoardCardContent({
  work,
  href,
  dragging = false,
}: {
  work: BoardWorkCard
  href?: string
  dragging?: boolean
}) {
  const body = (
    <article
      className={cn(
        'rounded-xl border border-accent/20 bg-[#14171c] p-3 shadow-sm',
        'transition-[transform,box-shadow,border-color,background-color] duration-300',
        dragging
          ? 'border-accent/50 bg-[#1a1f27] shadow-xl shadow-black/40 scale-[1.02] rotate-[0.4deg]'
          : 'hover:border-accent/40 hover:bg-[#171b22]',
        work.isOverdue && 'border-red-500/35'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{work.title}</h3>
        <WorkStatusBadge status={work.status} className="shrink-0 text-[10px] px-1.5 py-0.5" />
      </div>
      <div className="space-y-1 text-xs">
        <p className={cn('font-medium', work.isOverdue ? 'text-red-300' : 'text-white/80')}>
          {formatDeadline(work.deadline)}
          {work.isOverdue ? ' · in ritardo' : ''}
        </p>
        <p className="text-white/50 truncate">{work.clientName}</p>
        <p className="text-white/40 truncate">{work.categoryName}</p>
      </div>
    </article>
  )

  if (!href || dragging) return body
  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
      {body}
    </Link>
  )
}

export function DraggableWorkBoardCard({
  work,
  href,
  disabled = false,
  columnId,
}: {
  work: BoardWorkCard
  href: string
  disabled?: boolean
  /** Colonna di provenienza (userId o status) per il drag & drop. */
  columnId?: string
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
      <WorkBoardCardContent work={work} href={isDragging ? undefined : href} dragging={isDragging} />
    </div>
  )
}
