'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client, Category, User } from '@prisma/client'
import type { WorksTimelineResult } from '@/app/actions/works-timeline'
import type { TimelineViewUnit } from '@/lib/timeline-range'
import type { WorksPageView } from '@/lib/works-page-view'
import { WorksFilters, type WorksFiltersState } from './works-filters'
import { NewWorkButton, NewWorkModal } from './new-work-modal'

const WorksTimeline = dynamic(
  () => import('./works-timeline').then((m) => ({ default: m.WorksTimeline })),
  { loading: () => <div className="text-white/50 py-8">Caricamento timeline…</div> }
)
const WorksTable = dynamic(
  () => import('./works-table').then((m) => ({ default: m.WorksTable })),
  { loading: () => <div className="text-white/50 py-8">Caricamento elenco…</div> }
)

type WorkRow = {
  id: string
  title: string
  description: string | null
  clientId: string
  categoryId: string
  status: string
  priority: string | null
  deadline: Date | null
  assignedToUserId: string | null
  createdAt: Date
  updatedAt: Date
  client: { id: string; name: string }
  category: { id: string; name: string }
  assignedTo?: { id: string; name: string } | null
  steps?: { status: string }[]
}

interface WorksPageClientProps {
  pageView: WorksPageView
  works: WorkRow[]
  timelineData: WorksTimelineResult
  rangeStart: string
  rangeEnd: string
  rangeLabel: string
  period: TimelineViewUnit
  anchor: string
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: WorksFiltersState
  canEditTimeline?: boolean
}

export function WorksPageClient({
  pageView,
  works,
  timelineData,
  rangeStart,
  rangeEnd,
  rangeLabel,
  period,
  anchor,
  clients,
  categories,
  users,
  filters,
  canEditTimeline = false,
}: WorksPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('nuovo') === '1') setIsCreateOpen(true)
  }, [searchParams])

  const returnTo = useMemo(() => {
    const qs = searchParams.toString()
    return qs ? `/works?${qs}` : '/works'
  }, [searchParams])

  const setPageView = (view: WorksPageView) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.push(`/works?${params.toString()}`)
  }

  return (
    <>
      <WorksFilters clients={clients} categories={categories} users={users} filters={filters} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex rounded-md border border-accent/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setPageView('timeline')}
            className={`px-4 py-2 text-sm transition-colors ${
              pageView === 'timeline'
                ? 'bg-accent text-dark font-medium'
                : 'bg-dark text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setPageView('list')}
            className={`px-4 py-2 text-sm transition-colors ${
              pageView === 'list'
                ? 'bg-accent text-dark font-medium'
                : 'bg-dark text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Elenco
          </button>
        </div>
        <NewWorkButton onClick={() => setIsCreateOpen(true)} />
      </div>

      {pageView === 'timeline' ? (
        <WorksTimeline
          data={timelineData}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          rangeLabel={rangeLabel}
          period={period}
          anchor={anchor}
          returnTo={returnTo}
          canEdit={canEditTimeline}
        />
      ) : (
        <WorksTable works={works} returnTo={returnTo} filters={filters} />
      )}

      <NewWorkModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        clients={clients}
        categories={categories}
        users={users}
      />
    </>
  )
}
