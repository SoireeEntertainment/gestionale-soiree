import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { CalendarView } from '@/components/calendar/calendar-view'

export default async function CalendarPage(props: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const searchParams = await props.searchParams
  const now = new Date()
  let startDate: Date
  let endDate: Date

  switch (searchParams.range) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.setHours(23, 59, 59, 999))
      break
    case '7days':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      break
    case '30days':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break
    default:
      if (searchParams.start && searchParams.end) {
        startDate = new Date(searchParams.start)
        endDate = new Date(searchParams.end)
      } else {
        startDate = new Date(now.setHours(0, 0, 0, 0))
        endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      }
  }

  const works = await prisma.work.findMany({
    where: {
      deadline: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      client: true,
      category: true,
    },
    orderBy: {
      deadline: 'asc',
    },
  })

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Calendario</h1>
        <CalendarView works={works} initialRange={searchParams.range} />
      </div>
    </div>
  )
}

