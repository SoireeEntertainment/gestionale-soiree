'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client, Category, Work, User } from '@prisma/client'
import type { WorksTimelineResult } from '@/app/actions/works-timeline'
import type { TimelineViewUnit } from '@/lib/timeline-range'
import type { WorksPageView } from '@/lib/works-page-view'
import { WorksFilters, type WorksFiltersState } from './works-filters'
import { WorksTable } from './works-table'
import { WorksTimeline } from './works-timeline'
import { NewWorkButton, NewWorkModal } from './new-work-modal'

type WorkRow = Work & {
  client: Client
  category: Category
  assignedTo?: User | null
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
