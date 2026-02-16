'use server'

import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

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

export async function getWeeklyLoad(userId: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000)

  const works = await prisma.work.findMany({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_STATUSES },
      deadline: { gte: startOfWeek, lt: endOfWeek },
    },
  })

  const byStatus: Record<string, number> = {}
  works.forEach((w) => {
    byStatus[w.status] = (byStatus[w.status] || 0) + 1
  })

  return { total: works.length, byStatus }
}
