export type WorkDeadlineFilterValue = 'SCADUTI' | 'IN_SCADENZA_7_GIORNI' | 'TUTTI'

/** Applica filtri scadenza lavoro a un oggetto Prisma `where`. */
export function applyWorkDeadlineFilter(
  where: Record<string, unknown>,
  filter?: string | null,
  now = new Date()
): void {
  if (filter === 'SCADUTI') {
    where.deadline = { lt: now, not: null }
    where.status = { not: 'DONE' }
  } else if (filter === 'IN_SCADENZA_7_GIORNI') {
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    where.deadline = { gte: now, lte: sevenDaysFromNow }
    where.status = { not: 'DONE' }
  }
}
