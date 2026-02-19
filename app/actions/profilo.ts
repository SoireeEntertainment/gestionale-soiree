'use server'

import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getISOWeekStart } from '@/lib/ped-utils'
import {
  getPedDailyStatsForUser,
  getPedWeeklyTaskCountForUser,
  getPedDailyTaskCountForUser,
  getPedMonthlyTaskCountForUser,
} from '@/app/actions/ped'
import type { PedLabel } from '@/lib/pedLabels'

const ACTIVE_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED']
const CLOSED_STATUSES = ['DONE', 'CANCELED']

export async function getProfileKpis(userId: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)

  const assignedWhere = { assignedToUserId: userId }

  const [activeCount, dueIn7Count, overdueCount, inReviewOrWaitingCount] = await Promise.all([
    prisma.work.count({
      where: { ...assignedWhere, status: { in: ACTIVE_STATUSES } },
    }),
    prisma.work.count({
      where: {
        ...assignedWhere,
        status: { in: ACTIVE_STATUSES },
        deadline: { gte: startOfDay, lte: in7Days },
      },
    }),
    prisma.work.count({
      where: {
        ...assignedWhere,
        status: { in: ACTIVE_STATUSES },
        deadline: { lt: startOfDay },
      },
    }),
    prisma.work.count({
      where: {
        ...assignedWhere,
        status: { in: ['IN_REVIEW', 'WAITING_CLIENT'] },
      },
    }),
  ])

  return {
    activeCount,
    dueIn7Count,
    overdueCount,
    inReviewOrWaitingCount,
  }
}

export async function getMyWorksActive(userId: string, filters?: {
  status?: string
  categoryId?: string
  priority?: string
  deadlineFilter?: 'TUTTI' | 'OGGI' | '7_GG' | 'SCADUTI'
}) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const where: any = { assignedToUserId: userId, status: { in: ACTIVE_STATUSES } }
  if (filters?.status) where.status = filters.status
  if (filters?.categoryId) where.categoryId = filters.categoryId
  if (filters?.priority) where.priority = filters.priority
  if (filters?.deadlineFilter === 'OGGI') {
    where.deadline = { gte: startOfDay, lte: endOfDay }
  } else if (filters?.deadlineFilter === '7_GG') {
    where.deadline = { gte: startOfDay, lte: in7Days }
  } else if (filters?.deadlineFilter === 'SCADUTI') {
    where.deadline = { lt: startOfDay }
  }

  return prisma.work.findMany({
    where,
    include: { client: true, category: true },
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
  })
}

export async function getMyWorksArchive(userId: string, filters?: {
  clientId?: string
  categoryId?: string
  dateFrom?: string
  dateTo?: string
}) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const where: any = { assignedToUserId: userId, status: { in: CLOSED_STATUSES } }
  if (filters?.clientId) where.clientId = filters.clientId
  if (filters?.categoryId) where.categoryId = filters.categoryId
  if (filters?.dateFrom || filters?.dateTo) {
    where.updatedAt = {}
    if (filters.dateFrom) (where.updatedAt as any).gte = new Date(filters.dateFrom)
    if (filters.dateTo) (where.updatedAt as any).lte = new Date(filters.dateTo + 'T23:59:59')
  }

  return prisma.work.findMany({
    where,
    include: { client: true, category: true },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
}

export async function getProfileCalendarWorks(userId: string, range: 'today' | '7days' | '30days') {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const works = await prisma.work.findMany({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: start, lte: end30 },
    },
    include: { client: true, category: true },
    orderBy: { deadline: 'asc' },
  })

  return works
}

export async function getProfileRecentComments(userId: string, limit = 10) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  try {
    return await prisma.workComment.findMany({
      where: {
        work: { assignedToUserId: userId },
      },
      include: {
        work: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  } catch {
    return []
  }
}

/** Settimana ISO (lun-dom). Restituisce lavori assegnati con scadenza in settimana + byStatus. */
export async function getWeeklyLoad(userId: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const now = new Date()
  const weekStart = getISOWeekStart(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  const works = await prisma.work.findMany({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: weekStart, lte: weekEnd },
    },
  })

  const byStatus: Record<string, number> = {}
  works.forEach((w) => {
    byStatus[w.status] = (byStatus[w.status] || 0) + 1
  })

  return { total: works.length, byStatus }
}

const OVERVIEW_ADMIN_NAMES = ['Cristian Palazzolo', 'Davide Piccolo'] as const
const TEAM_OVERVIEW_USER_NAMES = [
  'Davide Piccolo',
  'Daniele Mirante',
  'Enrico Cairoli',
  'Alessia Pilutzu',
  'Cristian Palazzolo',
] as const

function isOverviewAdmin(user: { name: string | null }): boolean {
  return OVERVIEW_ADMIN_NAMES.some((n) => user.name === n)
}

/** Conteggio lavori assegnati nella settimana ISO. Autorizzato se currentUser === userId o overview-admin. */
export async function getAssignedWorkWeeklyCount(userId: string): Promise<number> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const isSelf = user.id === userId
  if (!isSelf && !isOverviewAdmin(user)) throw new Error('Non autorizzato')

  const now = new Date()
  const weekStart = getISOWeekStart(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  return prisma.work.count({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: weekStart, lte: weekEnd },
    },
  })
}

/** Conteggio lavori assegnati con scadenza nel giorno (dateKey). Autorizzato come getAssignedWorkWeeklyCount. */
export async function getAssignedWorkDailyCount(userId: string, dateKey: string): Promise<number> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const isSelf = user.id === userId
  if (!isSelf && !isOverviewAdmin(user)) throw new Error('Non autorizzato')

  const dayStart = new Date(dateKey + 'T00:00:00.000Z')
  const dayEnd = new Date(dateKey + 'T23:59:59.999Z')
  return prisma.work.count({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: dayStart, lte: dayEnd },
    },
  })
}

/** Conteggio lavori assegnati con scadenza nel mese corrente (UTC). Autorizzato come getAssignedWorkWeeklyCount. */
export async function getAssignedWorkMonthlyCount(userId: string): Promise<number> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const isSelf = user.id === userId
  if (!isSelf && !isOverviewAdmin(user)) throw new Error('Non autorizzato')

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  return prisma.work.count({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: monthStart, lte: monthEnd },
    },
  })
}

export type PedDailyStats = {
  total: number
  remaining: number
  done: number
  byLabel: Record<PedLabel, number>
}

export type AreaOperativaData = {
  pedDailyStats: PedDailyStats
  pedWeeklyTaskCount: number
  assignedWorkWeeklyCount: number
  weeklyLoadSummary: { total: number; taskCount: number; workCount: number }
}

/** Dati unici per Area Operativa: stats PED oggi, conteggi settimana, summary carico. */
export async function getAreaOperativaData(userId: string): Promise<AreaOperativaData> {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const today = new Date().toISOString().slice(0, 10)
  const [pedDailyStats, pedWeeklyTaskCount, assignedWorkWeeklyCount] = await Promise.all([
    getPedDailyStatsForUser(userId, today),
    getPedWeeklyTaskCountForUser(userId),
    getAssignedWorkWeeklyCount(userId),
  ])

  const weeklyLoadSummary = {
    taskCount: pedWeeklyTaskCount,
    workCount: assignedWorkWeeklyCount,
    total: pedWeeklyTaskCount + assignedWorkWeeklyCount,
  }

  return {
    pedDailyStats,
    pedWeeklyTaskCount,
    assignedWorkWeeklyCount,
    weeklyLoadSummary,
  }
}

export type WeeklyLoadUserRow = {
  userId: string
  userName: string
  taskCount: number
  workCount: number
  total: number
}

export type LoadSnapshot = { taskCount: number; workCount: number; total: number }

export type TeamLoadUserRow = {
  userId: string
  userName: string
  daily: LoadSnapshot
  weekly: LoadSnapshot
  monthly: LoadSnapshot
}

/** Overview carico (giornaliero + settimanale + mensile) per i 5 utenti team. Solo per Cristian Palazzolo e Davide Piccolo. */
export async function getTeamLoadOverview(): Promise<TeamLoadUserRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (!isOverviewAdmin(user)) return []

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      name: { in: [...TEAM_OVERVIEW_USER_NAMES] },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const today = new Date().toISOString().slice(0, 10)
  const rows: TeamLoadUserRow[] = []

  for (const u of users) {
    const [dailyTask, dailyWork, weeklyTask, weeklyWork, monthlyTask, monthlyWork] = await Promise.all([
      getPedDailyTaskCountForUser(u.id, today),
      getAssignedWorkDailyCount(u.id, today),
      getPedWeeklyTaskCountForUser(u.id),
      getAssignedWorkWeeklyCount(u.id),
      getPedMonthlyTaskCountForUser(u.id),
      getAssignedWorkMonthlyCount(u.id),
    ])
    rows.push({
      userId: u.id,
      userName: u.name ?? 'Senza nome',
      daily: {
        taskCount: dailyTask,
        workCount: dailyWork,
        total: dailyTask + dailyWork,
      },
      weekly: {
        taskCount: weeklyTask,
        workCount: weeklyWork,
        total: weeklyTask + weeklyWork,
      },
      monthly: {
        taskCount: monthlyTask,
        workCount: monthlyWork,
        total: monthlyTask + monthlyWork,
      },
    })
  }

  return rows
}

/** Overview carico settimanale per tutti gli utenti. Solo per Cristian Palazzolo e Davide Piccolo. @deprecated Prefer getTeamLoadOverview per la dashboard. */
export async function getWeeklyLoadOverviewForAllUsers(): Promise<WeeklyLoadUserRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (!isOverviewAdmin(user)) return []

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const rows: WeeklyLoadUserRow[] = []
  for (const u of users) {
    const [taskCount, workCount] = await Promise.all([
      getPedWeeklyTaskCountForUser(u.id),
      getAssignedWorkWeeklyCount(u.id),
    ])
    rows.push({
      userId: u.id,
      userName: u.name ?? 'Senza nome',
      taskCount,
      workCount,
      total: taskCount + workCount,
    })
  }
  rows.sort((a, b) => b.total - a.total)
  return rows
}
