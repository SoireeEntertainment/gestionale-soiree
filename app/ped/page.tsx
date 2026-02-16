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
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/dashboard')

  const searchParams = await props.searchParams
  const year = searchParams.year ? parseInt(searchParams.year, 10) : DEFAULT_YEAR
  const month = searchParams.month ? parseInt(searchParams.month, 10) : DEFAULT_MONTH
  const validYear = Number.isFinite(year) && year >= 2020 && year <= 2030 ? year : DEFAULT_YEAR
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : DEFAULT_MONTH

  let pedData: Awaited<ReturnType<typeof getPedMonth>>
  let clients: { id: string; name: string }[]
  let works: { id: string; title: string }[]
  let users: Awaited<ReturnType<typeof getUsers>>
  try {
    ;[pedData, clients, works, users] = await Promise.all([
      getPedMonth(validYear, validMonth),
      prisma.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.work.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true } }),
      getUsers(),
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
          year={validYear}
          month={validMonth}
        />
      </div>
    </div>
  )
}
