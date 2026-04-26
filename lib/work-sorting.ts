export type WorkSortBy = 'title' | 'client' | 'category' | 'status' | 'deadline' | 'assignedTo'
export type WorkSortDirection = 'asc' | 'desc'

type WorkLike = {
  title: string
  status: string
  deadline?: Date | string | null
  client?: { name?: string | null } | null
  category?: { name?: string | null } | null
  assignedTo?: { name?: string | null } | null
}

export function normalizeWorkStatus(status?: string | null): string {
  if (!status) return ''
  return String(status).trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_')
}

export function getWorkStatusRank(status?: string | null): number {
  const normalized = normalizeWorkStatus(status)
  if (normalized === 'TODO' || normalized === 'DA_FARE') return 0
  if (normalized === 'IN_PROGRESS' || normalized === 'IN_CORSO') return 1
  if (normalized === 'IN_REVIEW' || normalized === 'IN_REVISIONE') return 2
  if (normalized === 'WAITING_CLIENT' || normalized === 'ATTESA_CLIENTE') return 3
  if (normalized === 'DONE' || normalized === 'FATTO' || normalized === 'COMPLETATO') return 4
  if (normalized === 'PAUSED' || normalized === 'IN_PAUSA') return 5
  if (normalized === 'CANCELED' || normalized === 'CANCELLED' || normalized === 'ANNULLATO') return 6
  return 99
}

function deadlineToMs(d?: Date | string | null): number | null {
  if (!d) return null
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.getTime()
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'it', { sensitivity: 'base' })
}

function compareDeadlineWithNullsLast(a?: Date | string | null, b?: Date | string | null): number {
  const ams = deadlineToMs(a)
  const bms = deadlineToMs(b)
  if (ams == null && bms == null) return 0
  if (ams == null) return 1
  if (bms == null) return -1
  return ams - bms
}

export function sortWorksDefault<T extends WorkLike>(works: T[]): T[] {
  return [...works].sort((a, b) => {
    const statusCmp = getWorkStatusRank(a.status) - getWorkStatusRank(b.status)
    if (statusCmp !== 0) return statusCmp
    const deadlineCmp = compareDeadlineWithNullsLast(a.deadline, b.deadline)
    if (deadlineCmp !== 0) return deadlineCmp
    return compareText(a.title ?? '', b.title ?? '')
  })
}

export function sortWorksByColumn<T extends WorkLike>(
  works: T[],
  sortBy: WorkSortBy,
  sortDirection: WorkSortDirection
): T[] {
  const dir = sortDirection === 'asc' ? 1 : -1
  const sorted = [...works].sort((a, b) => {
    if (sortBy === 'title') return compareText(a.title ?? '', b.title ?? '')
    if (sortBy === 'client') return compareText(a.client?.name ?? '', b.client?.name ?? '')
    if (sortBy === 'category') return compareText(a.category?.name ?? '', b.category?.name ?? '')
    if (sortBy === 'assignedTo') return compareText(a.assignedTo?.name ?? '', b.assignedTo?.name ?? '')
    if (sortBy === 'status') return getWorkStatusRank(a.status) - getWorkStatusRank(b.status)
    return compareDeadlineWithNullsLast(a.deadline, b.deadline)
  })
  return dir === 1 ? sorted : sorted.reverse()
}
