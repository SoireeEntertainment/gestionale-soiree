import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getWorks } from '@/app/actions/works'
import { getWorksTimeline } from '@/app/actions/works-timeline'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import {
  formatAnchorDate,
  getTimelineRange,
  parseAnchorDate,
  parseTimelinePeriod,
} from '@/lib/timeline-range'
import { parseWorksPageView } from '@/lib/works-page-view'
import { WorksPageClient } from '@/components/works/works-page-client'

export default async function WorksPage(props: {
  searchParams: Promise<{
    view?: string
    period?: string
    date?: string
    clientId?: string
    categoryId?: string
    status?: string
    deadlineFilter?: string
    assignedUserId?: string
  }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const searchParams = await props.searchParams
  const pageView = parseWorksPageView(searchParams.view)
  const period = parseTimelinePeriod(searchParams.period)
  const anchor = parseAnchorDate(searchParams.date)
  const { start, end, label } = getTimelineRange(period, anchor)

  const filters = {
    clientId: searchParams.clientId,
    categoryId: searchParams.categoryId,
    status: searchParams.status,
    deadlineFilter: searchParams.deadlineFilter,
    assignedUserId: searchParams.assignedUserId,
  }

  const timelineFilters = {
    ...filters,
    deadlineFilter:
      filters.deadlineFilter === 'SCADUTI' || filters.deadlineFilter === 'IN_SCADENZA_7_GIORNI'
        ? filters.deadlineFilter
        : ('TUTTI' as const),
  }

  const [works, timelineData, clients, categories, users] = await Promise.all([
    pageView === 'list'
      ? getWorks({
          clientId: filters.clientId,
          categoryId: filters.categoryId,
          status: filters.status,
          deadlineFilter: filters.deadlineFilter as 'SCADUTI' | 'IN_SCADENZA_7_GIORNI' | 'TUTTI' | undefined,
          assignedUserId: filters.assignedUserId,
        })
      : Promise.resolve([]),
    pageView === 'timeline'
      ? getWorksTimeline({
          rangeStart: start,
          rangeEnd: end,
          categoryId: filters.categoryId,
          status: filters.status,
          clientId: filters.clientId,
          assignedUserId: filters.assignedUserId,
          deadlineFilter: timelineFilters.deadlineFilter,
        })
      : Promise.resolve({ works: [], withoutDeadline: [] }),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Lavori</h1>
        <WorksPageClient
          pageView={pageView}
          works={works}
          timelineData={timelineData}
          rangeStart={start.toISOString()}
          rangeEnd={end.toISOString()}
          rangeLabel={label}
          period={period}
          anchor={formatAnchorDate(anchor)}
          clients={clients}
          categories={categories}
          users={users}
          filters={filters}
        />
      </div>
    </div>
  )
}
