import { redirect } from 'next/navigation'
import { requireAuth, canWrite } from '@/lib/auth-dev'
import { getWorksArchive, getWorksPersonBoard } from '@/app/actions/works-board'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { WorksPageClient } from '@/components/works/works-page-client'
import type { WorksView } from '@/components/works/works-view-tabs'

export default async function WorksPage(props: {
  searchParams: Promise<{
    clientId?: string
    categoryId?: string
    status?: string
    deadlineFilter?: string
    assignedUserId?: string
    q?: string
    view?: string
  }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const searchParams = await props.searchParams

  // Filtro Stato=Fatto sulla vista attiva → Archivio
  if (searchParams.status === 'DONE' && searchParams.view !== 'archive') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value == null || key === 'status') continue
      params.set(key, value)
    }
    params.set('view', 'archive')
    redirect(`/works?${params.toString()}`)
  }

  const view: WorksView =
    searchParams.view === 'archive' || searchParams.status === 'DONE' ? 'archive' : 'active'

  const filters = {
    clientId: searchParams.clientId,
    categoryId: searchParams.categoryId,
    status: searchParams.status === 'DONE' ? undefined : searchParams.status,
    deadlineFilter: searchParams.deadlineFilter as
      | 'SCADUTI'
      | 'IN_SCADENZA_7_GIORNI'
      | 'TUTTI'
      | undefined,
    assignedUserId: searchParams.assignedUserId,
    q: searchParams.q,
  }

  const [clients, categories, users] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  if (view === 'archive') {
    const archive = await getWorksArchive(filters)
    return (
      <div className="min-h-screen bg-dark p-4 md:p-6">
        <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-white">Lavori</h1>
            <p className="mt-1 text-sm text-white/55">
              Archivio dei lavori completati. Riattiva un lavoro per riportarlo in board.
            </p>
          </div>
          <WorksPageClient
            view="archive"
            boardData={null}
            archiveWorks={archive.works}
            activeCount={archive.activeCount}
            archiveCount={archive.archiveCount}
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

  const boardData = await getWorksPersonBoard(filters)

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-white">Lavori</h1>
          <p className="mt-1 text-sm text-white/55">
            Panoramica operativa per persona. Apri una colonna per la board per stato.
          </p>
        </div>
        <WorksPageClient
          view="active"
          boardData={boardData}
          archiveWorks={[]}
          activeCount={boardData.activeCount}
          archiveCount={boardData.archiveCount}
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
