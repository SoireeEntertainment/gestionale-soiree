import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getPedMonth } from '@/app/actions/ped'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { PedView } from '@/components/ped/ped-view'

export const dynamic = 'force-dynamic'

const DEFAULT_YEAR = 2026
const DEFAULT_MONTH = 2

export default async function PedPage(props: {
  searchParams: Promise<{ year?: string; month?: string; userId?: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/dashboard')

  const searchParams = await props.searchParams
  const year = searchParams.year ? parseInt(searchParams.year, 10) : DEFAULT_YEAR
  const month = searchParams.month ? parseInt(searchParams.month, 10) : DEFAULT_MONTH
  const validYear = Number.isFinite(year) && year >= 2020 && year <= 2030 ? year : DEFAULT_YEAR
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : DEFAULT_MONTH

  const users = await getUsers()
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
