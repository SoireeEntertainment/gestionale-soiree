'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { applyWorkDeadlineFilter } from '@/lib/work-deadline-filter'
import { dateOnlyToDbDate, dbDateToDateOnly, todayDateOnlyRome } from '@/lib/timeline-dates'
import {
  computeIsOverdue,
  matchBoardTeamUser,
  sortArchiveWorks,
  sortBoardWorksByDeadline,
  type ArchiveWorkCard,
  type BoardWorkCard,
  WORKS_STATUS_BOARD_COLUMNS,
} from '@/lib/works-board'
import { normalizeWorkStatus } from '@/lib/work-status'
import { getUsers } from '@/lib/users'
import {
  computePrimaryAssigneeId,
  computeReassignedAssigneeIds,
  newlyAddedAssigneeIds,
  uniqueUserIds,
} from '@/lib/work-assignee-reassign'
import { sendWorkAssignedEmail } from '@/lib/work-assignment-email'
import { applyDeadlineChangeInTransaction } from '@/lib/work-due-date-history'

const boardFiltersSchema = z.object({
  clientId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.string().optional(),
  deadlineFilter: z.enum(['SCADUTI', 'IN_SCADENZA_7_GIORNI', 'TUTTI']).optional(),
  assignedUserId: z.string().optional(),
  q: z.string().optional(),
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
  activeCount: number
  archiveCount: number
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
  const today = todayDateOnlyRome()
  const deadline = work.deadline ? dbDateToDateOnly(work.deadline) : null
  const status = normalizeWorkStatus(work.status) ?? work.status
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
    isOverdue: computeIsOverdue(deadline, status, today),
  }
}

function toArchiveCard(
  work: {
    id: string
    title: string
    status: string
    deadline: Date | null
    clientId: string
    categoryId: string
    assignedToUserId: string | null
    client: { id: string; name: string }
    category: { id: string; name: string }
    assignees: { userId: string; user?: { name: string } | null }[]
  },
  nameById: Map<string, string>
): ArchiveWorkCard {
  const base = toBoardCard(work)
  const ids = base.assigneeUserIds
  const assigneeNames = ids
    .map((id) => nameById.get(id) ?? work.assignees.find((a) => a.userId === id)?.user?.name ?? '')
    .filter(Boolean)
  return { ...base, assigneeNames }
}

const boardWorkSelect = {
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
} as const

async function countWorksByBucket() {
  const [activeCount, archiveCount] = await Promise.all([
    prisma.work.count({
      where: { status: { notIn: ['DONE', 'CANCELED'] } },
    }),
    prisma.work.count({
      where: { status: 'DONE' },
    }),
  ])
  return { activeCount, archiveCount }
}

async function loadActiveBoardWorks(filters?: z.infer<typeof boardFiltersSchema>) {
  const where: Record<string, unknown> = {
    status: { notIn: ['DONE', 'CANCELED'] },
  }
  if (filters?.clientId) where.clientId = filters.clientId
  if (filters?.categoryId) where.categoryId = filters.categoryId
  if (filters?.status && filters.status !== 'DONE' && filters.status !== 'CANCELED') {
    where.status = filters.status
  }
  applyWorkDeadlineFilter(where, filters?.deadlineFilter)

  return prisma.work.findMany({
    where,
    select: boardWorkSelect,
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }],
  })
}

export async function getWorksPersonBoard(
  filters?: z.infer<typeof boardFiltersSchema>
): Promise<WorksBoardData> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = boardFiltersSchema.parse(filters ?? {})
  const [users, works, counts] = await Promise.all([
    getUsers(),
    loadActiveBoardWorks(parsed),
    countWorksByBucket(),
  ])
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

  return { columns, unassigned, ...counts }
}

export async function getWorksArchive(
  filters?: z.infer<typeof boardFiltersSchema>
): Promise<{ works: ArchiveWorkCard[]; activeCount: number; archiveCount: number }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = boardFiltersSchema.parse(filters ?? {})
  const where: Record<string, unknown> = { status: 'DONE' }
  if (parsed.clientId) where.clientId = parsed.clientId
  if (parsed.categoryId) where.categoryId = parsed.categoryId
  if (parsed.assignedUserId) {
    where.OR = [
      { assignedToUserId: parsed.assignedUserId },
      { assignees: { some: { userId: parsed.assignedUserId } } },
    ]
  }
  if (parsed.q?.trim()) {
    where.title = { contains: parsed.q.trim(), mode: 'insensitive' }
  }

  const [works, users, counts] = await Promise.all([
    prisma.work.findMany({
      where,
      select: {
        ...boardWorkSelect,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
      },
    }),
    getUsers(),
    countWorksByBucket(),
  ])

  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const cards = sortArchiveWorks(works.map((w) => toArchiveCard(w, nameById)))
  return { works: cards, ...counts }
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
    status: { notIn: ['DONE', 'CANCELED'] },
    OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
  }
  if (parsed.clientId) where.clientId = parsed.clientId
  if (parsed.categoryId) where.categoryId = parsed.categoryId
  if (parsed.status && parsed.status !== 'DONE' && parsed.status !== 'CANCELED') {
    where.status = parsed.status
  }
  applyWorkDeadlineFilter(where, parsed.deadlineFilter)

  const [works, archiveCount] = await Promise.all([
    prisma.work.findMany({
      where,
      select: boardWorkSelect,
    }),
    prisma.work.count({
      where: {
        status: 'DONE',
        OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
      },
    }),
  ])

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
    archiveCount,
    columns,
    summary: {
      todo: columns.find((c) => c.status === 'TODO')?.count ?? 0,
      inReview: columns.find((c) => c.status === 'IN_REVIEW')?.count ?? 0,
      done: archiveCount,
    },
  }
}

export async function getWorksArchiveForUser(
  userId: string,
  filters?: z.infer<typeof boardFiltersSchema>
): Promise<{ works: ArchiveWorkCard[]; activeCount: number; archiveCount: number }> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (!userId) throw new Error('Utente non valido')

  const parsed = boardFiltersSchema.parse(filters ?? {})
  const where: Record<string, unknown> = {
    status: 'DONE',
    OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
  }
  if (parsed.clientId) where.clientId = parsed.clientId
  if (parsed.categoryId) where.categoryId = parsed.categoryId
  if (parsed.q?.trim()) {
    where.title = { contains: parsed.q.trim(), mode: 'insensitive' }
  }

  const [works, users, activeCount] = await Promise.all([
    prisma.work.findMany({
      where,
      select: {
        ...boardWorkSelect,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
      },
    }),
    getUsers(),
    prisma.work.count({
      where: {
        status: { notIn: ['DONE', 'CANCELED'] },
        OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
      },
    }),
  ])

  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const cards = sortArchiveWorks(works.map((w) => toArchiveCard(w, nameById)))
  return { works: cards, activeCount, archiveCount: cards.length }
}

const reassignSchema = z.object({
  workId: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
})

/**
 * Drag A → B: sostituisce l’assegnazione di A con B, preservando gli altri.
 * Notifica solo gli utenti appena aggiunti.
 */
export async function reassignWorkOnBoard(input: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const { workId, fromUserId, toUserId } = reassignSchema.parse(input)
  if (fromUserId === toUserId) return { success: true as const }

  const [source, target, work] = await Promise.all([
    prisma.user.findFirst({ where: { id: fromUserId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: toUserId, isActive: true }, select: { id: true } }),
    prisma.work.findUnique({
      where: { id: workId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        deadline: true,
        assignedToUserId: true,
        client: { select: { name: true } },
        category: { select: { name: true } },
        assignees: { select: { userId: true } },
      },
    }),
  ])
  if (!source) throw new Error('Utente di partenza non trovato o non attivo')
  if (!target) throw new Error('Utente destinazione non trovato o non attivo')
  if (!work) throw new Error('Lavoro non trovato')

  const previousIds = uniqueUserIds([
    work.assignedToUserId,
    ...work.assignees.map((a) => a.userId),
  ])
  const nextIds = computeReassignedAssigneeIds({
    currentAssigneeIds: previousIds,
    fromUserId,
    toUserId,
  })
  const nextPrimary = computePrimaryAssigneeId({
    currentPrimaryId: work.assignedToUserId,
    fromUserId,
    toUserId,
    nextAssigneeIds: nextIds,
  })
  const newlyAdded = newlyAddedAssigneeIds(previousIds, nextIds)

  await prisma.$transaction(async (tx) => {
    await tx.workAssignee.deleteMany({
      where: { workId, userId: fromUserId },
    })
    if (!previousIds.includes(toUserId)) {
      await tx.workAssignee.create({
        data: { workId, userId: toUserId, role: 'ASSIGNEE' },
      })
    }
    const existing = await tx.workAssignee.findMany({
      where: { workId },
      select: { userId: true },
    })
    const existingSet = new Set(existing.map((e) => e.userId))
    const missing = nextIds.filter((id) => !existingSet.has(id))
    if (missing.length > 0) {
      await tx.workAssignee.createMany({
        data: missing.map((userId) => ({ workId, userId, role: 'ASSIGNEE' })),
        skipDuplicates: true,
      })
    }
    const extras = existing.filter((e) => !nextIds.includes(e.userId)).map((e) => e.userId)
    if (extras.length > 0) {
      await tx.workAssignee.deleteMany({
        where: { workId, userId: { in: extras } },
      })
    }
    await tx.work.update({
      where: { id: workId },
      data: { assignedToUserId: nextPrimary },
    })
  })

  if (newlyAdded.length > 0) {
    try {
      const recipients = await prisma.user.findMany({
        where: { id: { in: newlyAdded }, isActive: true },
        select: { id: true, name: true, email: true },
      })
      await Promise.allSettled(
        recipients
          .filter((u) => !!u.email?.trim())
          .map((u) =>
            sendWorkAssignedEmail({
              user: { id: u.id, name: u.name, email: u.email },
              work,
            })
          )
      )
    } catch (emailErr) {
      console.error('[reassignWorkOnBoard] notification error', { workId, error: emailErr })
    }
  }

  revalidatePath('/works')
  revalidatePath(`/works/person/${fromUserId}`)
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
    select: { id: true, assignedToUserId: true, clientId: true, assignees: { select: { userId: true } } },
  })

  revalidatePath('/works')
  if (updated.assignedToUserId) revalidatePath(`/works/person/${updated.assignedToUserId}`)
  for (const a of updated.assignees) {
    revalidatePath(`/works/person/${a.userId}`)
  }
  revalidatePath(`/works/${updated.id}`)
  revalidatePath('/ped')
  revalidatePath('/profilo')
  revalidatePath(`/clients/${updated.clientId}`)
  return { success: true as const, archived: status === 'DONE' }
}

const rescheduleSchema = z.object({
  workId: z.string().min(1),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  note: z.string().max(2000).optional().nullable(),
})

export async function rescheduleWorkDeadline(input: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const parsed = rescheduleSchema.parse(input)
  const newDeadline = parsed.deadline ? dateOnlyToDbDate(parsed.deadline) : null

  const result = await prisma.$transaction(async (tx) =>
    applyDeadlineChangeInTransaction(tx, {
      workId: parsed.workId,
      newDeadline,
      changedByUserId: user.id,
      note: parsed.note,
    })
  )

  const work = await prisma.work.findUnique({
    where: { id: parsed.workId },
    select: {
      id: true,
      assignedToUserId: true,
      clientId: true,
      assignees: { select: { userId: true } },
    },
  })

  revalidatePath('/works')
  if (work?.assignedToUserId) revalidatePath(`/works/person/${work.assignedToUserId}`)
  for (const a of work?.assignees ?? []) {
    revalidatePath(`/works/person/${a.userId}`)
  }
  revalidatePath(`/works/${parsed.workId}`)
  revalidatePath('/ped')
  revalidatePath('/profilo')
  if (work?.clientId) revalidatePath(`/clients/${work.clientId}`)

  return {
    success: true as const,
    changed: result.changed,
    deadline: parsed.deadline,
  }
}

const reactivateSchema = z.object({
  workId: z.string().min(1),
})

export async function reactivateWork(input: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const { workId } = reactivateSchema.parse(input)
  const current = await prisma.work.findUnique({
    where: { id: workId },
    select: {
      id: true,
      status: true,
      assignedToUserId: true,
      clientId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!current) throw new Error('Lavoro non trovato')
  if (current.status !== 'DONE') throw new Error('Il lavoro non è in archivio')

  await prisma.work.update({
    where: { id: workId },
    data: { status: 'TODO' },
  })

  revalidatePath('/works')
  if (current.assignedToUserId) revalidatePath(`/works/person/${current.assignedToUserId}`)
  for (const a of current.assignees) {
    revalidatePath(`/works/person/${a.userId}`)
  }
  revalidatePath(`/works/${workId}`)
  revalidatePath('/ped')
  revalidatePath('/profilo')
  revalidatePath(`/clients/${current.clientId}`)

  return { success: true as const }
}
