import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getPedDailyStatsForUser } from '@/app/actions/ped'
import { getTeamLoadOverview } from '@/app/actions/profilo'
import { getDashboardTaskStats, getDashboardWorkStats } from '@/app/actions/dashboard'
import type { PedLabel } from '@/lib/pedLabels'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'

export default async function DashboardPage() {
  await connection()
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  // Inizializza con valori di default
  let totalClients = 0
  let totalWorks = 0
  let worksInDeadline: any[] = []
  let expiredWorks: any[] = []
  let inReviewWorks: any[] = []
  const defaultByLabel: Record<PedLabel, number> = { IN_APPROVAZIONE: 0, DA_FARE: 0, PRONTO_NON_PUBBLICATO: 0, FATTO: 0 }
  let pedDailyStats: { total: number; remaining: number; done: number; byLabel: Record<PedLabel, number> } = {
    total: 0,
    remaining: 0,
    done: 0,
    byLabel: defaultByLabel,
  }
  let teamLoadOverview: Awaited<ReturnType<typeof getTeamLoadOverview>> = []

  let taskStats: Awaited<ReturnType<typeof getDashboardTaskStats>> = {
    total: 0,
    byType: {},
    periodLabel: 'oggi',
  }
  let workStats: Awaited<ReturnType<typeof getDashboardWorkStats>> = {
    total: 0,
    byCategory: [],
    capacity: { max: 40, current: 0, saturationPct: 0, isOverloaded: false },
  }
  try {
    const today = new Date().toISOString().slice(0, 10)
    const [pedResult, overviewResult, taskResult, workResult] = await Promise.all([
      getPedDailyStatsForUser(user.id, today),
      getTeamLoadOverview(),
      getDashboardTaskStats(user.id),
      getDashboardWorkStats(user.id),
    ])
    pedDailyStats = pedResult
    teamLoadOverview = overviewResult
    taskStats = taskResult
    workStats = workResult
  } catch (e) {
    // ignore
  }

  // Dati lavori: solo quelli assegnati all'utente (dashboard personale)
  try {
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const assignedWhere = { assignedToUserId: user.id }

    totalClients = await prisma.client.count()
    totalWorks = await prisma.work.count()

    worksInDeadline = await prisma.work.findMany({
      where: {
        ...assignedWhere,
        deadline: {
          gte: now,
          lte: sevenDaysFromNow,
        },
        status: { not: 'DONE' },
      },
      include: {
        client: true,
        category: true,
        assignedTo: true,
      },
      take: 10,
    })

    expiredWorks = await prisma.work.findMany({
      where: {
        ...assignedWhere,
        deadline: { lt: now },
        status: { not: 'DONE' },
      },
      include: {
        client: true,
        category: true,
        assignedTo: true,
      },
      take: 10,
    })

    inReviewWorks = await prisma.work.findMany({
      where: {
        ...assignedWhere,
        status: { in: ['IN_REVIEW', 'WAITING_CLIENT'] },
      },
      include: {
        client: true,
        category: true,
        assignedTo: true,
      },
      take: 10,
    })
  } catch (error: unknown) {
    console.error('Database error:', error instanceof Error ? error.message : error)
  }

  return (
    <div
      className="min-h-screen bg-dark p-6"
      style={{ minHeight: '100vh', backgroundColor: 'var(--dark, #0c0e11)', color: '#fff', padding: '1.5rem' }}
    >
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white" style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1.5rem', color: '#fff' }}>Dashboard</h1>
        <DashboardGrid
          totalClients={totalClients}
          totalWorks={totalWorks}
          worksInDeadline={worksInDeadline}
          expiredWorks={expiredWorks}
          inReviewWorks={inReviewWorks}
          pedDailyStatsByLabel={pedDailyStats.byLabel}
          teamLoadRows={teamLoadOverview}
          taskStats={taskStats}
          workStats={workStats}
        />
      </div>
    </div>
  )
}
