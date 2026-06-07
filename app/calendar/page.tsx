import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { getWorksTimeline } from '@/app/actions/works-timeline'
import {
  formatAnchorDate,
  getTimelineRange,
  parseAnchorDate,
  parseTimelineView,
} from '@/lib/timeline-range'
import { WorksTimelineDynamic } from '@/components/calendar/works-timeline-dynamic'

export default async function CalendarPage(props: {
  searchParams: Promise<{
    view?: string
    date?: string
    categoryId?: string
    assignedUserId?: string
    status?: string
    clientId?: string
  }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const searchParams = await props.searchParams
  const view = parseTimelineView(searchParams.view)
  const anchor = parseAnchorDate(searchParams.date)
  const { start, end, label } = getTimelineRange(view, anchor)

  const filters = {
    categoryId: searchParams.categoryId,
    assignedUserId: searchParams.assignedUserId,
    status: searchParams.status,
    clientId: searchParams.clientId,
  }

  const [data, clients, categories, users] = await Promise.all([
    getWorksTimeline({
      rangeStart: start,
      rangeEnd: end,
      ...filters,
    }),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Timeline lavori</h1>
        <WorksTimelineDynamic
          data={data}
          rangeStart={start.toISOString()}
          rangeEnd={end.toISOString()}
          rangeLabel={label}
          view={view}
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
