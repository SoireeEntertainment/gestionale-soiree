'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { updateWorkDates } from '@/app/actions/works'
import type { TimelineWorkItem } from '@/app/actions/works-timeline'
import { getTimelineBarPosition } from '@/lib/timeline-bar-position'
import {
  addDaysLocal,
  ensureMinDuration,
  formatDateOnly,
  getWorkEffectiveEndDate,
  getWorkEffectiveStartDate,
  MIN_DRAG_PX,
  pixelDeltaToDays,
} from '@/lib/timeline-dates'
import { measureAction } from '@/lib/measure-action'
import { showToast } from '@/lib/toast'

type DragMode = 'move' | 'resize-start' | 'resize-end'

type TimelineWorkBarProps = {
  work: TimelineWorkItem
  rangeStart: Date
  rangeEnd: Date
  returnTo: string
  canEdit: boolean
  onDatesChange?: (workId: string, startDate: string | null, deadline: string) => void
}

export function TimelineWorkBar({
  work,
  rangeStart,
  rangeEnd,
  returnTo,
  canEdit,
  onDatesChange,
}: TimelineWorkBarProps) {
  const router = useRouter()
  const barAreaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    originStart: Date
    originEnd: Date
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const [previewStart, setPreviewStart] = useState<Date | null>(null)
  const [previewEnd, setPreviewEnd] = useState<Date | null>(null)
  const previewRef = useRef<{ start: Date; end: Date } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  const committedStart = useMemo(
    () => getWorkEffectiveStartDate(work),
    [work.startDate, work.createdAt]
  )
  const committedEnd = useMemo(
    () => (work.deadline ? getWorkEffectiveEndDate(work.deadline) : null),
    [work.deadline]
  )

  const displayStart = previewStart ?? committedStart
  const displayEnd = previewEnd ?? committedEnd

  const bar = useMemo(() => {
    if (!displayEnd) return null
    return getTimelineBarPosition(displayStart, displayEnd, rangeStart, rangeEnd)
  }, [displayStart, displayEnd, rangeStart, rangeEnd])

  const resetPreview = useCallback(() => {
    setPreviewStart(null)
    setPreviewEnd(null)
    setIsDragging(false)
    dragRef.current = null
  }, [])

  const applyDragDelta = useCallback(
    (mode: DragMode, deltaDays: number, originStart: Date, originEnd: Date) => {
      if (deltaDays === 0) {
        return { start: originStart, end: originEnd }
      }
      if (mode === 'move') {
        return ensureMinDuration(
          addDaysLocal(originStart, deltaDays),
          addDaysLocal(originEnd, deltaDays),
          0
        )
      }
      if (mode === 'resize-start') {
        const nextStart = addDaysLocal(originStart, deltaDays)
        return ensureMinDuration(nextStart, originEnd, 0)
      }
      const nextEnd = addDaysLocal(originEnd, deltaDays)
      return ensureMinDuration(originStart, nextEnd, 0)
    },
    []
  )

  const persistDates = useCallback(
    async (start: Date, end: Date) => {
      const previousStart = committedStart
      const previousEnd = committedEnd!
      setPreviewStart(start)
      setPreviewEnd(end)
      showToast('Aggiornamento date…', 'loading')

      try {
        const result = await measureAction('updateWorkDates', () =>
          updateWorkDates(work.id, {
            startDate: formatDateOnly(start),
            deadline: formatDateOnly(end),
          })
        )
        onDatesChange?.(work.id, result.startDate, result.deadline)
        showToast('Date lavoro aggiornate', 'success')
        resetPreview()
      } catch (e) {
        setPreviewStart(previousStart)
        setPreviewEnd(previousEnd)
        showToast(e instanceof Error ? e.message : 'Errore nel salvataggio', 'error')
        resetPreview()
      }
    },
    [committedStart, committedEnd, onDatesChange, resetPreview, work.id]
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !barAreaRef.current) return

      const deltaPx = e.clientX - drag.startX
      if (Math.abs(deltaPx) >= MIN_DRAG_PX) drag.moved = true

      const deltaDays = pixelDeltaToDays(
        deltaPx,
        barAreaRef.current.offsetWidth,
        rangeStart,
        rangeEnd
      )
      const next = applyDragDelta(drag.mode, deltaDays, drag.originStart, drag.originEnd)
      previewRef.current = next
      setPreviewStart(next.start)
      setPreviewEnd(next.end)
      setTooltip({ x: e.clientX, y: e.clientY })
    },
    [applyDragDelta, rangeEnd, rangeStart]
  )

  const pointerUpHandlerRef = useRef<(e: PointerEvent) => void>(() => {})
  pointerUpHandlerRef.current = () => {
    const drag = dragRef.current
    if (!drag) return

    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', pointerUpHandlerRef.current)

    const preview = previewRef.current
    if (drag.moved && preview) {
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 300)
      void persistDates(preview.start, preview.end)
    } else {
      resetPreview()
    }

    previewRef.current = null
    setTooltip(null)
    setIsDragging(false)
    dragRef.current = null
  }

  const startDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (!canEdit || !committedEnd) return
    e.preventDefault()
    e.stopPropagation()

    dragRef.current = {
      mode,
      startX: e.clientX,
      originStart: committedStart,
      originEnd: committedEnd,
      moved: false,
    }
    setIsDragging(true)
    setTooltip({ x: e.clientX, y: e.clientY })

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', pointerUpHandlerRef.current)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', pointerUpHandlerRef.current)
    }
  }, [onPointerMove])

  const handleBarClick = () => {
    if (suppressClickRef.current || isDragging) return
    router.push(`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`)
  }

  if (!bar || !displayEnd) return null

  const progressLabel = `${work.progress}%`

  return (
    <>
      <div ref={barAreaRef} className="absolute inset-0">
        <div
          role="button"
          tabIndex={0}
          onClick={handleBarClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleBarClick()
          }}
          className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-md overflow-hidden border bg-white/5 transition-colors group/bar ${
            isDragging
              ? 'border-accent/60 bg-accent/10 shadow-lg z-20'
              : 'border-white/10 hover:border-accent/40'
          }`}
          style={{ left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }}
          onMouseEnter={(e) => !isDragging && setTooltip({ x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => !isDragging && setTooltip({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => !isDragging && setTooltip(null)}
        >
          {canEdit && (
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 opacity-0 group-hover/bar:opacity-100 bg-white/20 hover:bg-accent/40 rounded-l"
              onPointerDown={(e) => startDrag(e, 'resize-start')}
              title="Modifica data di partenza"
            />
          )}

          <div
            className={`absolute inset-y-0 ${canEdit ? 'left-2 right-2' : 'inset-x-0'} ${canEdit ? 'cursor-move' : 'cursor-pointer'}`}
            onPointerDown={canEdit ? (e) => startDrag(e, 'move') : undefined}
          >
            {bar.continuesBefore && (
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent/50 rounded-l" title="Iniziato prima del periodo" />
            )}
            <div
              className="absolute inset-y-0 left-0 bg-accent/70 rounded-l-md pointer-events-none"
              style={{ width: `${work.progress}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white truncate drop-shadow pointer-events-none">
              {progressLabel} · {work.title}
            </span>
            {bar.continuesAfter && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-white/30 pointer-events-none"
                title="Continua dopo il periodo"
              />
            )}
          </div>

          {canEdit && (
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 opacity-0 group-hover/bar:opacity-100 bg-white/20 hover:bg-accent/40 rounded-r"
              onPointerDown={(e) => startDrag(e, 'resize-end')}
              title="Modifica scadenza"
            />
          )}

          <span
            className="absolute right-0 top-0 bottom-0 w-0.5 bg-red-400/80 pointer-events-none"
            title={`Scadenza: ${format(displayEnd, 'dd MMM yyyy', { locale: it })}`}
          />
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-accent/30 bg-[#1a1a1a] px-3 py-2 shadow-xl text-xs text-white/90"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div>Partenza: {format(displayStart, 'dd/MM/yyyy', { locale: it })}</div>
          <div>Scadenza: {format(displayEnd, 'dd/MM/yyyy', { locale: it })}</div>
          {isDragging && <div className="text-accent mt-1">Rilascia per salvare</div>}
        </div>
      )}
    </>
  )
}
