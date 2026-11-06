import { redirect } from 'next/navigation'
import { requireAuth, canWrite } from '@/lib/auth-dev'
import { getWorksPersonBoard } from '@/app/actions/works-board'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { WorksPageClient } from '@/components/works/works-page-client'

export default async function WorksPage(props: {
  searchParams: Promise<{
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
  const filters = {
    clientId: searchParams.clientId,
    categoryId: searchParams.categoryId,
    status: searchParams.status,
    deadlineFilter: searchParams.deadlineFilter as
      | 'SCADUTI'
      | 'IN_SCADENZA_7_GIORNI'
      | 'TUTTI'
      | undefined,
  }

  const [boardData, clients, categories, users] = await Promise.all([
    getWorksPersonBoard(filters),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Lavori</h1>
          <p className="mt-1 text-sm text-white/55">
            Panoramica operativa per persona. Apri una colonna per la board per stato.
          </p>
        </div>
        <WorksPageClient
          boardData={boardData}
          clients={clients}
          categories={categories}
          users={users}
          filters={filters}
          canEdit={canWrite(user)}
        />
      </div>
    </div>
  )
}
