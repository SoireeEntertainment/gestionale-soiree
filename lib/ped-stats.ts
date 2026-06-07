import { getISOWeekStartKey } from '@/lib/ped-utils'

type PedItemLike = {
  date: string
  status: string
}

export type PedComputedStats = {
  dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount?: number }>
  weeklyStats: { weekStart: string; weekEnd: string; total: number; done: number }[]
  monthlyStats: { total: number; done: number }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function computePedStatsFromItems(items: PedItemLike[]): PedComputedStats {
  const dailyStats: PedComputedStats['dailyStats'] = {}
  const weekMap = new Map<string, { total: number; done: number }>()
  let monthlyTotal = 0
  let monthlyDone = 0

  for (const item of items) {
    const dayKey = item.date.slice(0, 10)
    if (!dailyStats[dayKey]) dailyStats[dayKey] = { total: 0, done: 0, remainingPct: 0, remainingCount: 0 }
    dailyStats[dayKey].total++
    if (item.status === 'DONE') dailyStats[dayKey].done++
    monthlyTotal++
    if (item.status === 'DONE') monthlyDone++

    const weekKey = getISOWeekStartKey(dayKey)
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, { total: 0, done: 0 })
    const w = weekMap.get(weekKey)!
    w.total++
    if (item.status === 'DONE') w.done++
  }

  for (const key of Object.keys(dailyStats)) {
    const s = dailyStats[key]
    s.remainingCount = s.total - s.done
    s.remainingPct = s.total === 0 ? 0 : Math.round((s.remainingCount / s.total) * 100)
  }

  const weeklyStats = Array.from(weekMap.entries()).map(([weekStart, { total, done }]) => {
    const d = new Date(weekStart + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() + 6)
    return {
      weekStart,
      weekEnd: toDateString(d),
      total,
      done,
    }
  })

  return {
    dailyStats,
    weeklyStats,
    monthlyStats: { total: monthlyTotal, done: monthlyDone },
  }
}
