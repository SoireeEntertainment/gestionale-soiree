'use server'

import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { MAX_LAVORI_TOTALI } from '@/lib/dashboard-types'

const ACTIVE_WORK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED']

/**
 * Statistiche Task (PED) per l'utente: periodo = oggi.
 * Breakdown per tipologia di contenuto (Reel, Post, Story, ecc.).
 */
export async function getDashboardTaskStats(
  userId: string
): Promise<import('@/lib/dashboard-types').DashboardTaskStats> {
  const current = await getCurrentUser()
  if (!current || current.id !== userId) throw new Error('Non autorizzato')

  const today = new Date().toISOString().slice(0, 10)
  const dayStart = new Date(today + 'T00:00:00.000Z')
  const dayEnd = new Date(today + 'T23:59:59.999Z')

  const items = await prisma.pedItem.findMany({
    where: {
      OR: [{ ownerId: userId }, { assignedToUserId: userId }],
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { type: true },
  })

  const byType: Record<string, number> = {}
  for (const item of items) {
    const t = item.type ?? 'OTHER'
    byType[t] = (byType[t] ?? 0) + 1
  }

  return {
    total: items.length,
    byType,
    periodLabel: 'oggi',
  }
}

/**
 * Statistiche Lavori assegnati all'utente (stati attivi).
 * Breakdown per categoria + capacità (saturazione %).
 */
export async function getDashboardWorkStats(
  userId: string
): Promise<import('@/lib/dashboard-types').DashboardWorkStats> {
  const current = await getCurrentUser()
  if (!current || current.id !== userId) throw new Error('Non autorizzato')

  const works = await prisma.work.findMany({
    where: {
      assignedToUserId: userId,
      status: { in: ACTIVE_WORK_STATUSES },
    },
    select: { categoryId: true, category: { select: { name: true } } },
  })

  const byCategoryMap: Record<string, number> = {}
  for (const w of works) {
    const name = w.category?.name ?? 'Senza categoria'
    byCategoryMap[name] = (byCategoryMap[name] ?? 0) + 1
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([categoryName, count]) => ({ categoryName, count }))
    .sort((a, b) => b.count - a.count)

  const total = works.length
  const max = MAX_LAVORI_TOTALI
  const saturationPct = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0
  const isOverloaded = saturationPct >= 90

  return {
    total,
    byCategory,
    capacity: {
      max,
      current: total,
      saturationPct,
      isOverloaded,
    },
  }
}

/**
 * Restituisce la capacità lavori per l'utente (stesso dato in getDashboardWorkStats).
 * Utile se si vuole solo il dato capacità senza rianalisi.
 */
export async function getWorkCapacity(userId: string) {
  const stats = await getDashboardWorkStats(userId)
  return stats.capacity
}
