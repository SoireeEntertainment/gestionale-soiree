import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getPedMonth } from '@/app/actions/ped'
import { prisma } from '@/lib/prisma'
import { getUsersForPed } from '@/lib/users'
import { PedView } from '@/components/ped/ped-view'
export const dynamic = 'force-dynamic'

/** Restituisce anno e mese da usare per la vista PED. Precedenza: week param → year/month params → settimana corrente. */
function resolveYearMonth(searchParams: { year?: string; month?: string; week?: string }): { year: number; month: number } {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() + 1

  const weekParam = searchParams.week?.trim()
  if (weekParam) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekParam)
    if (match) {
      const y = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      const d = parseInt(match[3], 10)
      const date = new Date(Date.UTC(y, m - 1, d))
      if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
        return { year: y, month: m }
      }
    }
  }

  const year = searchParams.year ? parseInt(searchParams.year, 10) : currentYear
  const month = searchParams.month ? parseInt(searchParams.month, 10) : currentMonth
  const validYear = Number.isFinite(year) && year >= 2020 && year <= 2030 ? year : currentYear
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : currentMonth
  return { year: validYear, month: validMonth }
}

export default async function PedPage(props: {
  searchParams: Promise<{ year?: string; month?: string; week?: string; userId?: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/dashboard')

  const searchParams = await props.searchParams
  const { year: validYear, month: validMonth } = resolveYearMonth(searchParams)

  const users = await getUsersForPed()
  const requestedUserId = searchParams.userId?.trim() || null
  const validViewUserId =
    requestedUserId && users.some((u) => u.id === requestedUserId) ? requestedUserId : null
  const viewAsUserId = validViewUserId ?? user.id
  const viewAsUserName = users.find((u) => u.id === viewAsUserId)?.name ?? user.name ?? 'Utente'
  const isViewingOtherUser = viewAsUserId !== user.id

  let pedData: Awaited<ReturnType<typeof getPedMonth>>
  let clients: { id: string; name: string }[]
  let works: { id: string; title: string }[]
  try {
    ;[pedData, clients, works] = await Promise.all([
      getPedMonth(validYear, validMonth, viewAsUserId),
      prisma.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.work.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true } }),
    ])
  } catch (err) {
    console.error('Errore pagina PED:', err)
    throw err
  }

  const initialData = {
    ...pedData,
    pedItems: pedData.pedItems.map((item) => ({
      ...item,
      date: typeof item.date === 'string' ? item.date : item.date.toISOString().slice(0, 10),
    })),
  }

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <PedView
          initialData={initialData}
          clients={clients}
          works={works}
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          currentUserId={user.id}
          currentUserName={user.name ?? 'Utente'}
          viewAsUserId={viewAsUserId}
          viewAsUserName={viewAsUserName}
          isViewingOtherUser={isViewingOtherUser}
          year={validYear}
          month={validMonth}
        />
      </div>
    </div>
  )
}
