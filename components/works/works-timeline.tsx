'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { WorkStatusBadge } from '@/components/works/work-status-badge'
import type { TimelineWorkItem, WorksTimelineResult } from '@/app/actions/works-timeline'
import { getTimelineBarPosition } from '@/lib/timeline-bar-position'
import {
  formatAnchorDate,
  getTimelineTicks,
  getTodayLinePercent,
  navigateTimeline,
  parseAnchorDate,
  type TimelineViewUnit,
} from '@/lib/timeline-range'

const PERIOD_UNITS: { value: TimelineViewUnit; label: string }[] = [
  { value: 'day', label: 'Giorno' },
  { value: 'week', label: 'Settimana' },
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
]

function formatAssignees(assignees: { id: string; name: string }[]): string {
  if (assignees.length === 0) return 'Non assegnato'
  if (assignees.length === 1) return assignees[0].name
  return `${assignees[0].name} +${assignees.length - 1}`
}

function assigneeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function WorkTooltip({ work, x, y }: { work: TimelineWorkItem; x: number; y: number }) {
  return (
    <div
      className="fixed z-50 pointer-events-none w-72 rounded-lg border border-accent/30 bg-[#1a1a1a] p-3 shadow-xl text-sm"
      style={{ left: x + 12, top: y + 12 }}
    >
      <div className="font-semibold text-white mb-1">{work.title}</div>
      <div className="text-white/70 space-y-1">
        <div>Cliente: {work.clientName}</div>
        <div>Categoria: {work.categoryName}</div>
        <div className="flex items-center gap-2">
          Stato: <WorkStatusBadge status={work.status} />
        </div>
        <div>
          Scadenza:{' '}
          {work.deadline ? format(new Date(work.deadline), 'dd MMM yyyy', { locale: it }) : 'Nessuna'}
        </div>
        <div>Assegnatari: {formatAssignees(work.assignees)}</div>
        <div>
          Avanzamento: {work.progress}%
          {work.totalSteps > 0
            ? ` (${work.completedSteps}/${work.totalSteps} step)`
            : ' (nessuno step)'}
        </div>
      </div>
    </div>
  )
}

function TimelineWorkRow({
  work,
  rangeStart,
  rangeEnd,
  returnTo,
}: {
  work: TimelineWorkItem
  rangeStart: Date
  rangeEnd: Date
  returnTo: string
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const bar = useMemo(() => {
    if (!work.deadline) return null
    return getTimelineBarPosition(
      new Date(work.createdAt),
      new Date(work.deadline),
      rangeStart,
      rangeEnd
    )
  }, [work.createdAt, work.deadline, rangeStart, rangeEnd])

  const progressLabel = `${work.progress}%`

  return (
    <>
      <div className="flex items-stretch border-b border-white/5 min-h-[56px] group">
        <div className="w-full md:w-72 shrink-0 p-3 border-r border-white/5 flex flex-col justify-center gap-1">
          <Link
            href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
            className="text-white text-sm font-medium hover:text-accent truncate"
          >
            {work.title}
          </Link>
          <div className="text-xs text-white/50 truncate">{work.clientName}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <WorkStatusBadge status={work.status} className="text-[10px] px-1.5 py-0.5" />
            <span className="text-[10px] text-white/40">{work.categoryName}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {work.assignees.length === 0 ? (
              <span className="text-[10px] text-white/40">Non assegnato</span>
            ) : (
              <>
                <div className="flex -space-x-1">
                  {work.assignees.slice(0, 3).map((a) => (
                    <span
                      key={a.id}
                      title={a.name}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[9px] font-medium text-accent border border-accent/30"
                    >
                      {assigneeInitials(a.name)}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-white/50">{formatAssignees(work.assignees)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 relative min-w-[200px] p-3">
          {bar && (
            <Link
              href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
              className="block absolute top-1/2 -translate-y-1/2 h-7 rounded-md overflow-hidden border border-white/10 bg-white/5 hover:border-accent/40 transition-colors"
              style={{ left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }}
              onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              {bar.continuesBefore && (
                <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent/50 rounded-l" title="Iniziato prima del periodo" />
              )}
              <div
                className="absolute inset-y-0 left-0 bg-accent/70 rounded-l-md"
                style={{ width: `${work.progress}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white truncate drop-shadow">
                {progressLabel} · {work.title}
              </span>
              {bar.continuesAfter && (
                <span
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-white/30"
                  title="Continua dopo il periodo"
                />
              )}
              {work.deadline && (
                <span
                  className="absolute right-0 top-0 bottom-0 w-0.5 bg-red-400/80"
                  title={`Scadenza: ${format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}`}
                />
              )}
            </Link>
          )}
        </div>
      </div>
      {hover && <WorkTooltip work={work} x={hover.x} y={hover.y} />}
    </>
  )
}

interface WorksTimelineProps {
  data: WorksTimelineResult
  rangeStart: string
  rangeEnd: string
  rangeLabel: string
  period: TimelineViewUnit
  anchor: string
  returnTo: string
}

export function WorksTimeline({
  data,
  rangeStart,
  rangeEnd,
  rangeLabel,
  period,
  anchor,
  returnTo,
}: WorksTimelineProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rangeStartDate = useMemo(() => new Date(rangeStart), [rangeStart])
  const rangeEndDate = useMemo(() => new Date(rangeEnd), [rangeEnd])
  const ticks = useMemo(
    () => getTimelineTicks(period, rangeStartDate, rangeEndDate),
    [period, rangeStartDate, rangeEndDate]
  )
  const todayPercent = useMemo(
    () => getTodayLinePercent(rangeStartDate, rangeEndDate),
    [rangeStartDate, rangeEndDate]
  )

  const pushParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!params.get('view')) params.set('view', 'timeline')
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.push(`/works?${params.toString()}`)
  }

  const goToday = () => {
    pushParams({ date: formatAnchorDate(new Date()) })
  }

  const goNavigate = (direction: -1 | 1) => {
    const next = navigateTimeline(period, parseAnchorDate(anchor), direction)
    pushParams({ date: formatAnchorDate(next) })
  }

  const setPeriod = (nextPeriod: TimelineViewUnit) => {
    pushParams({ period: nextPeriod })
  }

  const isEmpty = data.works.length === 0 && data.withoutDeadline.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => goNavigate(-1)} aria-label="Periodo precedente">
            ←
          </Button>
          <Button size="sm" variant="secondary" onClick={goToday}>
            Oggi
          </Button>
          <Button size="sm" variant="secondary" onClick={() => goNavigate(1)} aria-label="Periodo successivo">
            →
          </Button>
          <span className="text-white font-medium capitalize ml-2">{rangeLabel}</span>
        </div>
        <div className="flex rounded-md border border-accent/20 overflow-hidden">
          {PERIOD_UNITS.map((unit) => (
            <button
              key={unit.value}
              type="button"
              onClick={() => setPeriod(unit.value)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === unit.value
                  ? 'bg-accent text-dark font-medium'
                  : 'bg-dark text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {unit.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-dark border border-accent/20 rounded-lg p-12 text-center">
          <p className="text-white/60">Nessun lavoro nel periodo selezionato.</p>
          <p className="text-white/40 text-sm mt-2">Prova a cambiare filtri o navigare ad un altro periodo.</p>
        </div>
      ) : (
        <>
          <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="flex border-b border-accent/20 bg-accent/5">
                  <div className="w-72 shrink-0 p-3 text-xs font-medium text-accent uppercase border-r border-white/10">
                    Lavoro
                  </div>
                  <div className="flex-1 relative h-10">
                    {ticks.map((tick, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 flex flex-col justify-center"
                        style={{ left: `${tick.percent}%` }}
                      >
                        <div className="h-full w-px bg-white/10" />
                        <span className="absolute top-2 left-1 text-[10px] text-white/50 whitespace-nowrap">
                          {tick.label}
                        </span>
                      </div>
                    ))}
                    {todayPercent !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-accent z-10"
                        style={{ left: `${todayPercent}%` }}
                        title="Oggi"
                      />
                    )}
                  </div>
                </div>
                {data.works.map((work) => (
                  <TimelineWorkRow
                    key={work.id}
                    work={work}
                    rangeStart={rangeStartDate}
                    rangeEnd={rangeEndDate}
                    returnTo={returnTo}
                  />
                ))}
              </div>
            </div>
          </div>

          {data.withoutDeadline.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-white mb-3">Senza scadenza</h2>
              <div className="bg-dark border border-accent/20 rounded-lg divide-y divide-white/5">
                {data.withoutDeadline.map((work) => (
                  <div key={work.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className="text-white font-medium hover:text-accent"
                      >
                        {work.title}
                      </Link>
                      <div className="text-sm text-white/50">
                        {work.clientName} · {work.categoryName}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <WorkStatusBadge status={work.status} />
                      <span className="text-xs text-white/50">{formatAssignees(work.assignees)}</span>
                      <span className="text-xs text-accent">
                        {work.totalSteps > 0
                          ? `${work.progress}% (${work.completedSteps}/${work.totalSteps})`
                          : '0%'}
                      </span>
                      <Link
                        href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className="text-sm text-accent hover:underline"
                      >
                        Dettagli →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
