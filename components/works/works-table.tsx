'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { WorkStatusBadge } from './work-status-badge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { sortWorksByColumn, sortWorksDefault, type WorkSortBy, type WorkSortDirection } from '@/lib/work-sorting'
import { calculateWorkStepProgress } from '@/lib/work-step-progress'
import type { WorksFiltersState } from './works-filters'

type WorkRow = {
  id: string
  title: string
  deadline: Date | null
  status: string
  client: { id: string; name: string }
  category: { id: string; name: string }
  assignedTo?: { id: string; name: string } | null
  steps?: { status: string }[]
}

interface WorksTableProps {
  works: WorkRow[]
  returnTo: string
  filters: WorksFiltersState
}

export function WorksTable({ works, returnTo, filters }: WorksTableProps) {
  const [sortBy, setSortBy] = useState<WorkSortBy | null>(null)
  const [sortDirection, setSortDirection] = useState<WorkSortDirection | null>(null)

  useEffect(() => {
    setSortBy(null)
    setSortDirection(null)
  }, [filters.clientId, filters.categoryId, filters.status, filters.deadlineFilter, filters.assignedUserId])

  const sortedWorks = useMemo(() => {
    if (sortBy && sortDirection) return sortWorksByColumn(works, sortBy, sortDirection)
    return sortWorksDefault(works)
  }, [works, sortBy, sortDirection])

  const toggleSort = (column: WorkSortBy) => {
    if (sortBy !== column) {
      setSortBy(column)
      setSortDirection('asc')
      return
    }
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sortIndicator = (column: WorkSortBy) => {
    if (sortBy !== column || !sortDirection) return '↕'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const ariaSort = (column: WorkSortBy): 'none' | 'ascending' | 'descending' => {
    if (sortBy !== column || !sortDirection) return 'none'
    return sortDirection === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-accent/10">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('title')}>
              <button type="button" onClick={() => toggleSort('title')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Titolo <span className="text-[10px]">{sortIndicator('title')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('client')}>
              <button type="button" onClick={() => toggleSort('client')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Cliente <span className="text-[10px]">{sortIndicator('client')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('category')}>
              <button type="button" onClick={() => toggleSort('category')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Categoria <span className="text-[10px]">{sortIndicator('category')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('status')}>
              <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Stato <span className="text-[10px]">{sortIndicator('status')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('deadline')}>
              <button type="button" onClick={() => toggleSort('deadline')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Scadenza <span className="text-[10px]">{sortIndicator('deadline')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">Avanzamento</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase" aria-sort={ariaSort('assignedTo')}>
              <button type="button" onClick={() => toggleSort('assignedTo')} className="inline-flex items-center gap-1 hover:text-white transition-colors">
                Assegnato a <span className="text-[10px]">{sortIndicator('assignedTo')}</span>
              </button>
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {sortedWorks.map((work) => {
            const isExpired = work.deadline && new Date(work.deadline) < new Date() && work.status !== 'DONE'
            const stepProgress = calculateWorkStepProgress(work.steps ?? [])
            return (
              <tr key={work.id} className="hover:bg-white/5">
                <td className="px-6 py-4 text-white">{work.title}</td>
                <td className="px-6 py-4 text-white/70">{work.client.name}</td>
                <td className="px-6 py-4 text-white/70">{work.category.name}</td>
                <td className="px-6 py-4">
                  <WorkStatusBadge status={work.status} />
                </td>
                <td className="px-6 py-4">
                  {work.deadline ? (
                    <span className={isExpired ? 'text-red-400' : 'text-white/70'}>
                      {format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}
                      {isExpired && <span className="ml-2 text-xs text-red-400">Scaduto</span>}
                    </span>
                  ) : (
                    <span className="text-white/50">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {stepProgress.total > 0 ? (
                    <ProgressBar percent={stepProgress.percent} showLabel className="min-w-[100px]" />
                  ) : (
                    <span className="text-white/50 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-white/70">{work.assignedTo?.name || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    className="text-accent hover:underline text-sm"
                  >
                    Dettagli
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sortedWorks.length === 0 && <EmptyState title="Nessun lavoro trovato" />}
    </div>
  )
}
