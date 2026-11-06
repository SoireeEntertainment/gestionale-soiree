'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { applyWorkDeadlineFilter } from '@/lib/work-deadline-filter'
import { formatDateOnly } from '@/lib/timeline-dates'
import {
  matchBoardTeamUser,
  sortBoardWorksByDeadline,
  type BoardWorkCard,
  WORKS_STATUS_BOARD_COLUMNS,
} from '@/lib/works-board'
import { normalizeWorkStatus } from '@/lib/work-status'
import { getUsers } from '@/lib/users'

const boardFiltersSchema = z.object({
  clientId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.string().optional(),
  deadlineFilter: z.enum(['SCADUTI', 'IN_SCADENZA_7_GIORNI', 'TUTTI']).optional(),
})

export type WorksBoardColumn = {
  key: string
  label: string
  userId: string
  name: string
  email: string
  count: number
  works: BoardWorkCard[]
}

export type WorksBoardData = {
  columns: WorksBoardColumn[]
  unassigned: BoardWorkCard[]
}

function toBoardCard(work: {
  id: string
  title: string
  status: string
  deadline: Date | null
  clientId: string
  categoryId: string
  assignedToUserId: string | null
  client: { id: string; name: string }
  category: { id: string; name: string }
  assignees: { userId: string }[]
}): BoardWorkCard {
  const today = formatDateOnly(new Date())
  const deadline = work.deadline ? formatDateOnly(work.deadline) : null
  const status = normalizeWorkStatus(work.status) ?? work.status
  const isOverdue = !!deadline && deadline < today && status !== 'DONE' && status !== 'CANCELED'
  return {
    id: work.id,
    title: work.title,
    status,
    deadline,
    clientId: work.clientId,
    clientName: work.client.name,
    categoryId: work.categoryId,
    categoryName: work.category.name,
    assignedToUserId: work.assignedToUserId,
    assigneeUserIds: [
      ...new Set(
        [work.assignedToUserId, ...work.assignees.map((a) => a.userId)].filter(
          (id): id is string => !!id
        )
      ),
    ],
    isOverdue,
  }
}

async function loadBoardWorks(filters?: z.infer<typeof boardFiltersSchema>) {
  const where: Record<string, unknown> = {
    status: { not: 'CANCELED' },
  }
  if (filters?.clientId) where.clientId = filters.clientId
  if (filters?.categoryId) where.categoryId = filters.categoryId
  if (filters?.status) where.status = filters.status
  applyWorkDeadlineFilter(where, filters?.deadlineFilter)

  return prisma.work.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      deadline: true,
      clientId: true,
      categoryId: true,
      assignedToUserId: true,
      client: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }],
  })
}

export async function getWorksPersonBoard(
  filters?: z.infer<typeof boardFiltersSchema>
): Promise<WorksBoardData> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = boardFiltersSchema.parse(filters ?? {})
  const [users, works] = await Promise.all([getUsers(), loadBoardWorks(parsed)])
  const team = matchBoardTeamUser(users)
  const teamIds = new Set(team.map((t) => t.userId))
  const cards = works.map(toBoardCard)

  const columns: WorksBoardColumn[] = team.map((member) => {
    const memberWorks = sortBoardWorksByDeadline(
      cards.filter(
        (work) =>
          work.assignedToUserId === member.userId || work.assigneeUserIds.includes(member.userId)
      )
    )
    return {
      key: member.key,
      label: member.label,
      userId: member.userId,
      name: member.name,
      email: member.email,
      count: memberWorks.length,
      works: memberWorks,
    }
  })

  const unassigned = sortBoardWorksByDeadline(
    cards.filter((work) => {
      const linked = new Set(work.assigneeUserIds)
      if (work.assignedToUserId) linked.add(work.assignedToUserId)
      if (linked.size === 0) return true
      return ![...linked].some((id) => teamIds.has(id))
    })
  )

  return { columns, unassigned }
}

export async function getWorksStatusBoardForUser(
  userId: string,
  filters?: z.infer<typeof boardFiltersSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (!userId) throw new Error('Utente non valido')

  const parsed = boardFiltersSchema.parse(filters ?? {})
  const boardUser = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, name: true, email: true },
  })
  if (!boardUser) throw new Error('Utente non trovato')

  const where: Record<string, unknown> = {
    status: { not: 'CANCELED' },
    OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
  }
  if (parsed.clientId) where.clientId = parsed.clientId
  if (parsed.categoryId) where.categoryId = parsed.categoryId
  if (parsed.status) where.status = parsed.status
  applyWorkDeadlineFilter(where, parsed.deadlineFilter)

  const works = await prisma.work.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      deadline: true,
      clientId: true,
      categoryId: true,
      assignedToUserId: true,
      client: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignees: { select: { userId: true } },
    },
  })

  const cards = sortBoardWorksByDeadline(works.map(toBoardCard))
  const columns = WORKS_STATUS_BOARD_COLUMNS.map((status) => {
    const columnWorks = cards.filter((work) => (normalizeWorkStatus(work.status) ?? work.status) === status)
    return {
      status,
      works: columnWorks,
      count: columnWorks.length,
    }
  })

  const overdueCount = cards.filter((w) => w.isOverdue).length

  return {
    user: boardUser,
    total: cards.length,
    overdueCount,
    columns,
    summary: {
      todo: columns.find((c) => c.status === 'TODO')?.count ?? 0,
      inReview: columns.find((c) => c.status === 'IN_REVIEW')?.count ?? 0,
      done: columns.find((c) => c.status === 'DONE')?.count ?? 0,
    },
  }
}

const reassignSchema = z.object({
  workId: z.string().min(1),
  toUserId: z.string().min(1),
})

/** Sposta l’assegnazione primaria di un lavoro a un altro membro della board. */
export async function reassignWorkOnBoard(input: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const { workId, toUserId } = reassignSchema.parse(input)
  const target = await prisma.user.findFirst({
    where: { id: toUserId, isActive: true },
    select: { id: true },
  })
  if (!target) throw new Error('Utente destinazione non trovato')

  await prisma.$transaction(async (tx) => {
    await tx.workAssignee.deleteMany({ where: { workId } })
    await tx.workAssignee.create({
      data: { workId, userId: toUserId, role: 'ASSIGNEE' },
    })
    await tx.work.update({
      where: { id: workId },
      data: { assignedToUserId: toUserId },
    })
  })

  revalidatePath('/works')
  revalidatePath(`/works/person/${toUserId}`)
  revalidatePath(`/works/${workId}`)
  revalidatePath('/profilo')
  return { success: true as const }
}

const moveStatusSchema = z.object({
  workId: z.string().min(1),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED']),
})

export async function moveWorkStatusOnBoard(input: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const { workId, status } = moveStatusSchema.parse(input)
  const updated = await prisma.work.update({
    where: { id: workId },
    data: { status },
    select: { id: true, assignedToUserId: true, clientId: true },
  })

  revalidatePath('/works')
  if (updated.assignedToUserId) revalidatePath(`/works/person/${updated.assignedToUserId}`)
  revalidatePath(`/works/${updated.id}`)
  revalidatePath('/ped')
  revalidatePath('/profilo')
  revalidatePath(`/clients/${updated.clientId}`)
  return { success: true as const }
}
