import { requireAuth } from '@/lib/auth-dev'
import { getClientUniverse, getMyDailyTasks } from '@/app/actions/daily-tasks'
import { prisma } from '@/lib/prisma'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const user = await requireAuth()

  const [tasks, universe, clients] = await Promise.all([
    getMyDailyTasks({ status: 'ALL' }),
    getClientUniverse(),
    prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      ...(user.role === 'AGENTE'
        ? {
            where: {
              OR: [
                { assignedToUserId: user.id },
                { assignees: { some: { userId: user.id } } },
              ],
            },
          }
        : {}),
    }),
  ])

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Task</h1>
          <p className="mt-1 text-sm text-white/55">
            Promemoria giornalieri e universo clienti da sentire. Separato da Lavori e PED editoriale.
          </p>
        </div>
        <TasksPageClient initialTasks={tasks} initialUniverse={universe} clients={clients} />
      </div>
    </div>
  )
}
