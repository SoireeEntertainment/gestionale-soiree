/**
 * Query layer read-only sui lavori (Prisma). Usato da work-read-handlers e orchestrator.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getISOWeekStart } from '@/lib/ped-utils'

export const WORK_ACTIVE_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED'] as const
export const WORK_TERMINAL_STATUSES = ['DONE', 'CANCELED'] as const

export type WorkPeriod = 'all' | 'today' | 'week' | 'month' | 'next7days'

export type WorkListFilters = {
  /** Solo lavori non conclusi (default true per elenchi operativi) */
  activeOnly?: boolean
  /** Solo scaduti e non terminali */
  overdueOnly?: boolean
  /** Filtro su deadline (combinato con logica OR su senza deadline dove indicato) */
  period?: WorkPeriod
  /** Con period, includi anche lavori attivi senza deadline */
  includeUndatedWithPeriod?: boolean
}

export type WorkListAssigneeRow = {
  id: string
  title: string
  status: string
  priority: string | null
  deadline: Date | null
  clientId: string
  clientName: string
  categoryName: string
  assigneeNames: string[]
  stepsDone: number
  stepsTotal: number
  stepPct: number | null
}

export type WorkStepRow = {
  id: string
  title: string
  status: string
  sortOrder: number
}

export type WorkProgressDto = {
  workId: string
  title: string
  clientName: string
  categoryName: string
  status: string
  priority: string | null
  deadline: Date | null
  steps: WorkStepRow[]
  stepsDone: number
  stepsTotal: number
  stepPct: number | null
  todoTitles: string[]
}

export type UserWorkloadRow = {
  userId: string
  userName: string
  assignedActive: number
  overdue: number
  doneInPeriod: number
}

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

function endOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

function weekRangeUtc(): { start: Date; end: Date } {
  const monday = getISOWeekStart(new Date())
  const start = new Date(monday)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(monday)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

function monthRangeUtc(): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const start = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, mo + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

function next7DaysRangeUtc(): { start: Date; end: Date } {
  const start = startOfDayUtc()
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

export function assignedToUserWhere(userId: string): Prisma.WorkWhereInput {
  return {
    OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
  }
}

function applyPeriodDeadlineFilter(
  where: Prisma.WorkWhereInput,
  period: WorkPeriod | undefined,
  includeUndated: boolean
): Prisma.WorkWhereInput {
  if (!period || period === 'all') return where
  let range: { start: Date; end: Date }
  switch (period) {
    case 'today':
      range = { start: startOfDayUtc(), end: endOfDayUtc() }
      break
    case 'week':
      range = weekRangeUtc()
      break
    case 'month':
      range = monthRangeUtc()
      break
    case 'next7days':
      range = next7DaysRangeUtc()
      break
    default:
      return where
  }
  const deadlineClause: Prisma.WorkWhereInput = {
    deadline: { gte: range.start, lte: range.end },
  }
  if (includeUndated) {
    return {
      ...where,
      AND: [
        {
          OR: [
            deadlineClause,
            { deadline: null, status: { in: [...WORK_ACTIVE_STATUSES] } },
          ],
        },
      ],
    }
  }
  return { ...where, AND: [deadlineClause] }
}

function mapWorkToRow(
  w: {
    id: string
    title: string
    status: string
    priority: string | null
    deadline: Date | null
    clientId: string
    client: { name: string }
    category: { name: string }
    assignedTo: { name: string } | null
    assignees: { user: { name: string } }[]
    steps: { status: string }[]
  }
): WorkListAssigneeRow {
  const fromM2m = w.assignees.map((a) => a.user.name)
  const primary = w.assignedTo?.name
  const assigneeNames = [...new Set([...(primary ? [primary] : []), ...fromM2m])]
  const stepsTotal = w.steps.length
  const stepsDone = w.steps.filter((s) => s.status === 'DONE').length
  const stepPct = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : null
  return {
    id: w.id,
    title: w.title,
    status: w.status,
    priority: w.priority,
    deadline: w.deadline,
    clientId: w.clientId,
    clientName: w.client.name,
    categoryName: w.category.name,
    assigneeNames,
    stepsDone,
    stepsTotal,
    stepPct,
  }
}

const workListSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  clientId: true,
  client: { select: { name: true } },
  category: { select: { name: true } },
  assignedTo: { select: { name: true } },
  assignees: { select: { user: { select: { name: true } } } },
  steps: { select: { status: true }, orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.WorkSelect

export async function searchWorksByUser(
  userId: string,
  filters: WorkListFilters = {}
): Promise<WorkListAssigneeRow[]> {
  const activeOnly = filters.activeOnly !== false
  const base: Prisma.WorkWhereInput = {
    ...assignedToUserWhere(userId),
  }
  if (filters.overdueOnly) {
    base.deadline = { lt: startOfDayUtc() }
    base.status = { notIn: [...WORK_TERMINAL_STATUSES] }
  } else if (activeOnly) {
    base.status = { in: [...WORK_ACTIVE_STATUSES] }
  }
  let where: Prisma.WorkWhereInput = base
  if (filters.period && filters.period !== 'all' && !filters.overdueOnly) {
    where = applyPeriodDeadlineFilter(
      base,
      filters.period,
      filters.includeUndatedWithPeriod === true
    )
  }
  const rows = await prisma.work.findMany({
    where,
    select: workListSelect,
    orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
    take: 80,
  })
  return rows.map(mapWorkToRow)
}

export async function searchWorksByClient(
  clientId: string,
  filters: WorkListFilters = {}
): Promise<WorkListAssigneeRow[]> {
  const activeOnly = filters.activeOnly !== false
  const base: Prisma.WorkWhereInput = { clientId }
  if (filters.overdueOnly) {
    base.deadline = { lt: startOfDayUtc() }
    base.status = { notIn: [...WORK_TERMINAL_STATUSES] }
  } else if (activeOnly) {
    base.status = { in: [...WORK_ACTIVE_STATUSES] }
  }
  let where: Prisma.WorkWhereInput = base
  if (filters.period && filters.period !== 'all' && !filters.overdueOnly) {
    where = applyPeriodDeadlineFilter(
      base,
      filters.period,
      filters.includeUndatedWithPeriod === true
    )
  }
  const rows = await prisma.work.findMany({
    where,
    select: workListSelect,
    orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
    take: 80,
  })
  return rows.map(mapWorkToRow)
}

export async function searchOverdueWorks(opts?: { userId?: string }): Promise<WorkListAssigneeRow[]> {
  const base: Prisma.WorkWhereInput = {
    deadline: { lt: startOfDayUtc() },
    status: { notIn: [...WORK_TERMINAL_STATUSES] },
  }
  if (opts?.userId) {
    base.AND = [assignedToUserWhere(opts.userId)]
  }
  const rows = await prisma.work.findMany({
    where: base,
    select: workListSelect,
    orderBy: [{ deadline: 'asc' }],
    take: 100,
  })
  return rows.map(mapWorkToRow)
}

export async function getWorkSteps(workId: string): Promise<WorkStepRow[]> {
  const steps = await prisma.workStep.findMany({
    where: { workId },
    select: { id: true, title: true, status: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })
  return steps
}

export async function getWorkProgressSummary(workId: string): Promise<WorkProgressDto | null> {
  const w = await prisma.work.findUnique({
    where: { id: workId },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      deadline: true,
      client: { select: { name: true } },
      category: { select: { name: true } },
    },
  })
  if (!w) return null
  const steps = await getWorkSteps(workId)
  const stepsTotal = steps.length
  const stepsDone = steps.filter((s) => s.status === 'DONE').length
  const stepPct = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : null
  const todoTitles = steps.filter((s) => s.status !== 'DONE').map((s) => s.title)
  return {
    workId: w.id,
    title: w.title,
    clientName: w.client.name,
    categoryName: w.category.name,
    status: w.status,
    priority: w.priority,
    deadline: w.deadline,
    steps,
    stepsDone,
    stepsTotal,
    stepPct,
    todoTitles,
  }
}

export async function getUserWorkloadSummary(period: WorkPeriod = 'week'): Promise<UserWorkloadRow[]> {
  const { start: periodStart, end: periodEnd } =
    period === 'month'
      ? monthRangeUtc()
      : period === 'today'
        ? { start: startOfDayUtc(), end: endOfDayUtc() }
        : weekRangeUtc()

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const rows: UserWorkloadRow[] = []
  for (const u of users) {
    const assignedActive = await prisma.work.count({
      where: {
        ...assignedToUserWhere(u.id),
        status: { in: [...WORK_ACTIVE_STATUSES] },
      },
    })
    const overdue = await prisma.work.count({
      where: {
        ...assignedToUserWhere(u.id),
        deadline: { lt: startOfDayUtc() },
        status: { notIn: [...WORK_TERMINAL_STATUSES] },
      },
    })
    const doneInPeriod = await prisma.work.count({
      where: {
        ...assignedToUserWhere(u.id),
        status: 'DONE',
        updatedAt: { gte: periodStart, lte: periodEnd },
      },
    })
    rows.push({
      userId: u.id,
      userName: u.name,
      assignedActive,
      overdue,
      doneInPeriod,
    })
  }
  rows.sort((a, b) => b.assignedActive - a.assignedActive)
  return rows
}

export async function getWeeklyWorkloadSummary(): Promise<UserWorkloadRow[]> {
  return getUserWorkloadSummary('week')
}

export async function getClientWorkSummary(clientId: string): Promise<WorkListAssigneeRow[]> {
  return searchWorksByClient(clientId, { activeOnly: true, includeUndatedWithPeriod: false })
}

/** Tutti i lavori attivi con filtro temporale sulla deadline (o senza deadline se includeUndated). */
export async function searchAllActiveWorksInPeriod(
  period: WorkPeriod,
  includeUndated = true
): Promise<WorkListAssigneeRow[]> {
  const base: Prisma.WorkWhereInput = { status: { in: [...WORK_ACTIVE_STATUSES] } }
  const where = applyPeriodDeadlineFilter(base, period, includeUndated)
  const rows = await prisma.work.findMany({
    where,
    select: workListSelect,
    orderBy: [{ deadline: 'asc' }, { client: { name: 'asc' } }, { title: 'asc' }],
    take: 100,
  })
  return rows.map(mapWorkToRow)
}

export async function searchWorksByCategoryName(
  categoryHint: string,
  filters: WorkListFilters = {}
): Promise<WorkListAssigneeRow[]> {
  const q = categoryHint.trim()
  if (!q) return []
  const cats = await prisma.category.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  })
  if (cats.length !== 1) return []
  const activeOnly = filters.activeOnly !== false
  const where: Prisma.WorkWhereInput = {
    categoryId: cats[0].id,
    ...(activeOnly ? { status: { in: [...WORK_ACTIVE_STATUSES] } } : {}),
  }
  const rows = await prisma.work.findMany({
    where,
    select: workListSelect,
    orderBy: [{ client: { name: 'asc' } }, { deadline: 'asc' }],
    take: 80,
  })
  return rows.map(mapWorkToRow)
}
