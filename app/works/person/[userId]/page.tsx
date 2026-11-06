import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireAuth, canWrite } from '@/lib/auth-dev'
import {
  getWorksArchiveForUser,
  getWorksStatusBoardForUser,
} from '@/app/actions/works-board'
import { matchBoardTeamUser } from '@/lib/works-board'
import { getUsers } from '@/lib/users'
import { WorksStatusBoard } from '@/components/works/works-status-board'
import { WorksArchiveList } from '@/components/works/works-archive-list'
import { WorksViewTabs, type WorksView } from '@/components/works/works-view-tabs'

export default async function WorksPersonPage(props: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{
    clientId?: string
    categoryId?: string
    status?: string
    deadlineFilter?: string
    view?: string
    q?: string
  }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const { userId } = await props.params
  const searchParams = await props.searchParams

  if (searchParams.status === 'DONE' && searchParams.view !== 'archive') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (value == null || key === 'status') continue
      params.set(key, value)
    }
    params.set('view', 'archive')
    redirect(`/works/person/${userId}?${params.toString()}`)
  }

  const view: WorksView = searchParams.view === 'archive' ? 'archive' : 'active'
  const filters = {
    clientId: searchParams.clientId,
    categoryId: searchParams.categoryId,
    status: searchParams.status === 'DONE' ? undefined : searchParams.status,
    deadlineFilter: searchParams.deadlineFilter as
      | 'SCADUTI'
      | 'IN_SCADENZA_7_GIORNI'
      | 'TUTTI'
      | undefined,
    q: searchParams.q,
  }

  const basePath = `/works/person/${userId}`
  const returnParams = new URLSearchParams()
  if (view === 'archive') returnParams.set('view', 'archive')
  for (const [key, value] of Object.entries(filters)) {
    if (value) returnParams.set(key, value)
  }
  const returnTo = returnParams.toString() ? `${basePath}?${returnParams.toString()}` : basePath

  if (view === 'archive') {
    let archive
    try {
      archive = await getWorksArchiveForUser(userId, filters)
    } catch {
      notFound()
    }

    const users = await getUsers()
    const team = matchBoardTeamUser(users)
    const teamMember = team.find((member) => member.userId === userId)
    const boardUser = users.find((u) => u.id === userId)
    const displayName =
      teamMember?.label ?? boardUser?.name.split(/\s+/)[0] ?? 'Utente'

    return (
      <div className="min-h-screen bg-dark p-4 md:p-6">
        <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
          <Link href="/works" className="mb-3 inline-block text-sm text-accent hover:underline">
            ← Torna alla panoramica Lavori
          </Link>

          <div className="mb-4">
            <h1 className="text-3xl font-bold text-white">Lavori di {displayName}</h1>
            <p className="mt-1 text-sm text-white/55">Archivio lavori completati</p>
          </div>

          <WorksViewTabs
            view="archive"
            activeCount={archive.activeCount}
            archiveCount={archive.archiveCount}
            basePath={basePath}
          />

          <WorksArchiveList
            works={archive.works}
            canEdit={canWrite(user)}
            returnTo={returnTo}
          />
        </div>
      </div>
    )
  }

  let board
  try {
    board = await getWorksStatusBoardForUser(userId, filters)
  } catch {
    notFound()
  }

  const team = matchBoardTeamUser(await getUsers())
  const teamMember = team.find((member) => member.userId === userId)
  const displayName = teamMember?.label ?? board.user.name.split(/\s+/)[0] ?? board.user.name

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <Link href="/works" className="mb-3 inline-block text-sm text-accent hover:underline">
          ← Torna alla panoramica Lavori
        </Link>

        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lavori di {displayName}</h1>
            <p className="mt-1 text-sm text-white/55">{board.user.name}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-accent/20 bg-white/[0.03] px-3 py-1.5 text-white/80">
              Attivi <strong className="text-white">{board.total}</strong>
            </span>
            <span className="rounded-full border border-accent/20 bg-white/[0.03] px-3 py-1.5 text-white/80">
              Da fare <strong className="text-white">{board.summary.todo}</strong>
            </span>
            <span className="rounded-full border border-accent/20 bg-white/[0.03] px-3 py-1.5 text-white/80">
              In revisione <strong className="text-white">{board.summary.inReview}</strong>
            </span>
            <span className="rounded-full border border-accent/20 bg-white/[0.03] px-3 py-1.5 text-white/80">
              Archivio <strong className="text-white">{board.summary.done}</strong>
            </span>
            {board.overdueCount > 0 && (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-200">
                In ritardo <strong>{board.overdueCount}</strong>
              </span>
            )}
          </div>
        </div>

        <WorksViewTabs
          view="active"
          activeCount={board.total}
          archiveCount={board.archiveCount}
          basePath={basePath}
        />

        <WorksStatusBoard
          initialColumns={board.columns}
          canEdit={canWrite(user)}
          returnTo={returnTo}
        />
      </div>
    </div>
  )
}
