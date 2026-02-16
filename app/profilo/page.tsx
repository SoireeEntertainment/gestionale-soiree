import { requireAuth, canWrite } from '@/lib/auth-dev'
import {
  getProfileKpis,
  getMyWorksActive,
  getMyWorksArchive,
  getProfileCalendarWorks,
  getProfileRecentComments,
  getWeeklyLoad,
} from '@/app/actions/profilo'
import { getMyTodos } from '@/app/actions/user-todos'
import { getMyPreferences } from '@/app/actions/user-preferences'
import { prisma } from '@/lib/prisma'
import { ProfileHeader } from '@/components/profilo/profile-header'
import { QuickActions } from '@/components/profilo/quick-actions'
import { MyWorksActive } from '@/components/profilo/my-works-active'
import { MyWorksArchive } from '@/components/profilo/my-works-archive'
import { ProfileCalendar } from '@/components/profilo/profile-calendar'
import { RecentUpdates } from '@/components/profilo/recent-updates'
import { PersonalTodos } from '@/components/profilo/personal-todos'
import { WeeklyLoad } from '@/components/profilo/weekly-load'
import { ProfileSettings } from '@/components/profilo/profile-settings'
import { ProfileCalendarClient } from '@/components/profilo/profile-calendar-client'

export const dynamic = 'force-dynamic'

export default async function ProfiloPage() {
  const user = await requireAuth()

  const defaults = {
    kpis: { activeCount: 0, dueIn7Count: 0, overdueCount: 0, inReviewOrWaitingCount: 0 },
    activeWorks: [] as Awaited<ReturnType<typeof getMyWorksActive>>,
    archiveWorks: [] as Awaited<ReturnType<typeof getMyWorksArchive>>,
    calendarWorks: [] as Awaited<ReturnType<typeof getProfileCalendarWorks>>,
    recentComments: [] as Awaited<ReturnType<typeof getProfileRecentComments>>,
    weeklyLoad: { total: 0, byStatus: {} as Record<string, number> },
    todos: [] as Awaited<ReturnType<typeof getMyTodos>>,
    preferences: { notifyDeadline24h: true, notifyDeadline48h: false, notifyInReview: true, notifyWaitingClient: true, timezone: 'Europe/Rome' as string },
    categories: [] as Awaited<ReturnType<typeof prisma.category.findMany>>,
    clients: [] as Awaited<ReturnType<typeof prisma.client.findMany>>,
  }

  const results = await Promise.allSettled([
    getProfileKpis(user.id),
    getMyWorksActive(user.id),
    getMyWorksArchive(user.id),
    getProfileCalendarWorks(user.id, '30days'),
    getProfileRecentComments(user.id, 10),
    getWeeklyLoad(user.id),
    getMyTodos(user.id),
    getMyPreferences(user.id),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
  ])

  const kpis = results[0].status === 'fulfilled' ? results[0].value : defaults.kpis
  const activeWorks = results[1].status === 'fulfilled' ? results[1].value : defaults.activeWorks
  const archiveWorks = results[2].status === 'fulfilled' ? results[2].value : defaults.archiveWorks
  const calendarWorks = results[3].status === 'fulfilled' ? results[3].value : defaults.calendarWorks
  const recentComments = results[4].status === 'fulfilled' ? results[4].value : defaults.recentComments
  const weeklyLoad = results[5].status === 'fulfilled' ? results[5].value : defaults.weeklyLoad
  const todos = results[6].status === 'fulfilled' ? results[6].value : defaults.todos
  const preferences = results[7].status === 'fulfilled' ? results[7].value : defaults.preferences
  const categories = results[8].status === 'fulfilled' ? results[8].value : defaults.categories
  const clients = results[9].status === 'fulfilled' ? results[9].value : defaults.clients

  const canWriteUser = canWrite(user)

  return (
    <div className="profilo-page min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Area operativa personale</h1>
        <p className="text-white/60 mb-6">Overview lavori, calendario e strumenti rapidi.</p>

        <ProfileHeader
          name={user.name}
          email={user.email}
          role={user.role}
          kpis={kpis}
        />

        <QuickActions canWrite={canWriteUser} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-0">
            <MyWorksActive
              works={activeWorks}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              canWrite={canWriteUser}
            />

            <MyWorksArchive
              works={archiveWorks}
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            />

            <ProfileCalendarClient works={calendarWorks} />

            <RecentUpdates
              comments={recentComments.map((c) => ({
                id: c.id,
                body: c.body,
                type: c.type,
                createdAt: c.createdAt,
                work: c.work,
                user: c.user,
              }))}
            />
          </div>

          <div>
            <WeeklyLoad total={weeklyLoad.total} byStatus={weeklyLoad.byStatus} />
            <PersonalTodos todos={todos} userId={user.id} />
            <ProfileSettings userId={user.id} initial={preferences} />
          </div>
        </div>
      </div>
    </div>
  )
}
