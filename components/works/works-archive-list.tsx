'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarDays, RotateCcw } from 'lucide-react'
import type { ArchiveWorkCard } from '@/lib/works-board'
import { BOARD_EASE } from '@/lib/works-board'
import { WorkStatusBadge } from '@/components/works/work-status-badge'
import { reactivateWork } from '@/app/actions/works-board'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Senza scadenza'
  try {
    return format(parseISO(deadline), 'dd MMM yyyy', { locale: it }).toUpperCase()
  } catch {
    return deadline
  }
}

export function WorksArchiveList({
  works,
  canEdit,
  returnTo,
}: {
  works: ArchiveWorkCard[]
  canEdit: boolean
  returnTo: string
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const visible = works.filter((w) => !hiddenIds.has(w.id))

  const handleReactivate = (work: ArchiveWorkCard) => {
    if (!canEdit || isPending) return
    setPendingId(work.id)
    const previous = new Set(hiddenIds)
    setHiddenIds((prev) => new Set([...prev, work.id]))

    startTransition(async () => {
      try {
        await reactivateWork({ workId: work.id })
        showToast('Lavoro riattivato — tornato in Da fare', 'success')
        router.refresh()
      } catch (error) {
        setHiddenIds(previous)
        showToast(error instanceof Error ? error.message : 'Riattivazione non riuscita', 'error')
      } finally {
        setPendingId(null)
      }
    })
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
        <p className="text-sm text-white/50">Nessun lavoro in archivio</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2.5">
      {visible.map((work) => (
        <li
          key={work.id}
          className={cn(
            'rounded-xl border border-accent/15 bg-[#14171c] px-3.5 py-3',
            'transition-[opacity,transform] duration-250',
            pendingId === work.id && 'opacity-50'
          )}
          style={{ transitionTimingFunction: BOARD_EASE }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white truncate">{work.title}</h3>
                <WorkStatusBadge status="DONE" className="shrink-0 text-[10px] px-1.5 py-0.5" />
              </div>
              <p className="text-xs text-white/55 truncate">
                {work.clientName}
                <span className="text-white/25"> · </span>
                {work.categoryName}
              </p>
              <p className="text-xs text-white/45 truncate">
                {work.assigneeNames.length > 0
                  ? work.assigneeNames.join(', ')
                  : 'Nessun assegnatario'}
              </p>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs font-semibold text-white/80">
                <CalendarDays className="h-3.5 w-3.5 text-accent/80" aria-hidden />
                <span>Consegna {formatDeadline(work.deadline)}</span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
                className="inline-flex min-h-[40px] items-center rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
              >
                Apri dettaglio
              </Link>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[40px] gap-1.5"
                  disabled={isPending && pendingId === work.id}
                  onClick={() => handleReactivate(work)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Riattiva lavoro
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
