'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { calculateWorkStepProgress } from '@/lib/work-step-progress'
import { applyWorkDeadlineFilter } from '@/lib/work-deadline-filter'

const timelineFiltersSchema = z.object({
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
  categoryId: z.string().optional(),
  assignedUserId: z.string().optional(),
  status: z.string().optional(),
  clientId: z.string().optional(),
  deadlineFilter: z.enum(['SCADUTI', 'IN_SCADENZA_7_GIORNI', 'TUTTI']).optional(),
})

export type TimelineWorkItem = {
  id: string
  title: string
  createdAt: string
  deadline: string | null
  status: string
  categoryName: string
  clientName: string
  assignees: { id: string; name: string }[]
  totalSteps: number
  completedSteps: number
  progress: number
}

export type WorksTimelineResult = {
  works: TimelineWorkItem[]
  withoutDeadline: TimelineWorkItem[]
}

function buildFilterWhere(filters: z.infer<typeof timelineFiltersSchema>) {
  const where: Record<string, unknown> = {}

  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.status) where.status = filters.status
  if (filters.clientId) where.clientId = filters.clientId

  if (filters.assignedUserId) {
    where.OR = [
      { assignedToUserId: filters.assignedUserId },
      { assignees: { some: { userId: filters.assignedUserId } } },
    ]
  }

  applyWorkDeadlineFilter(where, filters.deadlineFilter)

  return where
}

function buildWithDeadlineWhere(
  filters: z.infer<typeof timelineFiltersSchema>,
  baseWhere: Record<string, unknown>
) {
  const deadlineFilter = filters.deadlineFilter
  if (deadlineFilter === 'SCADUTI' || deadlineFilter === 'IN_SCADENZA_7_GIORNI') {
    return {
      ...baseWhere,
      createdAt: { lte: filters.rangeEnd },
    }
  }

  return {
    ...baseWhere,
    createdAt: { lte: filters.rangeEnd },
    deadline: {
      not: null,
      gte: filters.rangeStart,
    },
  }
}

function buildWithoutDeadlineWhere(
  filters: z.infer<typeof timelineFiltersSchema>,
  baseWhere: Record<string, unknown>
) {
  if (filters.deadlineFilter === 'SCADUTI' || filters.deadlineFilter === 'IN_SCADENZA_7_GIORNI') {
    return null
  }

  return {
    ...baseWhere,
    deadline: null,
  }
}

function mapWorkToTimelineItem(work: {
  id: string
  title: string
  createdAt: Date
  deadline: Date | null
  status: string
  category: { name: string }
  client: { name: string }
  assignedTo: { id: string; name: string } | null
  assignees: { user: { id: string; name: string } }[]
  steps: { status: string }[]
}): TimelineWorkItem {
  const assigneeMap = new Map<string, { id: string; name: string }>()
  if (work.assignedTo) assigneeMap.set(work.assignedTo.id, work.assignedTo)
  for (const a of work.assignees) assigneeMap.set(a.user.id, a.user)

  const stepProgress = calculateWorkStepProgress(work.steps)

  return {
    id: work.id,
    title: work.title,
    createdAt: work.createdAt.toISOString(),
    deadline: work.deadline?.toISOString() ?? null,
    status: work.status,
    categoryName: work.category.name,
    clientName: work.client.name,
    assignees: [...assigneeMap.values()],
    totalSteps: stepProgress.total,
    completedSteps: stepProgress.completed,
    progress: stepProgress.percent,
  }
}

const workInclude = {
  client: { select: { name: true } },
  category: { select: { name: true } },
  assignedTo: { select: { id: true, name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
  steps: { select: { status: true } },
} as const

export async function getWorksTimeline(input: unknown): Promise<WorksTimelineResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const filters = timelineFiltersSchema.parse(input)
  const baseWhere = buildFilterWhere(filters)
  const withDeadlineWhere = buildWithDeadlineWhere(filters, baseWhere)
  const withoutDeadlineWhere = buildWithoutDeadlineWhere(filters, baseWhere)

  const [withDeadline, withoutDeadlineRows] = await Promise.all([
    prisma.work.findMany({
      where: withDeadlineWhere,
      include: workInclude,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    }),
    withoutDeadlineWhere
      ? prisma.work.findMany({
          where: withoutDeadlineWhere,
          include: workInclude,
          orderBy: [{ createdAt: 'desc' }],
        })
      : Promise.resolve([]),
  ])

  return {
    works: withDeadline.map(mapWorkToTimelineItem),
    withoutDeadline: withoutDeadlineRows.map(mapWorkToTimelineItem),
  }
}
