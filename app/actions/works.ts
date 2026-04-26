'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { workSchema } from '@/lib/validations'
import { parseDeadlineFromInput } from '@/lib/date-utils'

export async function createWork(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseDeadlineFromInput(validated.deadline ?? undefined)
  const { assigneeUserIds, ...workFields } = validated

  const work = await prisma.work.create({
    data: {
      ...workFields,
      deadline: deadlineDate,
    },
    include: {
      client: true,
      category: true,
    },
  })

  const assigneeSet = new Set<string>(assigneeUserIds ?? [])
  if (workFields.assignedToUserId) assigneeSet.add(workFields.assignedToUserId)
  const list = [...assigneeSet]
  if (list.length > 0) {
    await prisma.workAssignee.createMany({
      data: list.map((userId) => ({ workId: work.id, userId, role: 'ASSIGNEE' })),
      skipDuplicates: true,
    })
    if (!work.assignedToUserId && list[0]) {
      await prisma.work.update({
        where: { id: work.id },
        data: { assignedToUserId: list[0] },
      })
    }
  }

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath(`/clients/${validated.clientId}`)
  const workOut =
    list.length > 0 && !work.assignedToUserId
      ? await prisma.work.findUniqueOrThrow({
          where: { id: work.id },
          include: { client: true, category: true },
        })
      : work

  return { success: true, work: workOut }
}

export async function syncWorkAssignees(workId: string, userIds: string[]) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const unique = [...new Set(userIds.filter(Boolean))]
  await prisma.$transaction(async (tx) => {
    await tx.workAssignee.deleteMany({ where: { workId } })
    if (unique.length > 0) {
      await tx.workAssignee.createMany({
        data: unique.map((userId) => ({ workId, userId, role: 'ASSIGNEE' })),
      })
    }
    await tx.work.update({
      where: { id: workId },
      data: { assignedToUserId: unique[0] ?? null },
    })
  })

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath('/profilo')
  revalidatePath(`/works/${workId}`)
}

export async function removeWorkAssignees(workId: string, userIds: string[]) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const toRemove = new Set(userIds.filter(Boolean))
  if (toRemove.size === 0) return

  await prisma.workAssignee.deleteMany({
    where: { workId, userId: { in: [...toRemove] } },
  })

  const work = await prisma.work.findUnique({
    where: { id: workId },
    select: { assignedToUserId: true },
  })
  if (work?.assignedToUserId && toRemove.has(work.assignedToUserId)) {
    const first = await prisma.workAssignee.findFirst({
      where: { workId },
      select: { userId: true },
    })
    await prisma.work.update({
      where: { id: workId },
      data: { assignedToUserId: first?.userId ?? null },
    })
  }

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath('/profilo')
  revalidatePath(`/works/${workId}`)
}

export async function updateWork(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseDeadlineFromInput(validated.deadline ?? undefined)
  const { assigneeUserIds, ...workFields } = validated

  const work = await prisma.work.update({
    where: { id },
    data: {
      ...workFields,
      deadline: deadlineDate,
    },
    include: {
      client: true,
      category: true,
    },
  })

  if (assigneeUserIds !== undefined) {
    await syncWorkAssignees(id, assigneeUserIds)
  }

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath('/profilo')
  revalidatePath(`/works/${id}`)
  revalidatePath(`/clients/${validated.clientId}`)
  return { success: true, work }
}

export async function deleteWork(id: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const work = await prisma.work.findUnique({
    where: { id },
    select: { clientId: true },
  })

  await prisma.work.delete({
    where: { id },
  })

  revalidatePath('/works')
  revalidatePath('/calendar')
  if (work) {
    revalidatePath(`/clients/${work.clientId}`)
  }
  return { success: true }
}

const workStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED'])

const updateWorkFromPedSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: workStatusSchema.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  deadline: z.string().nullable().optional(), // YYYY-MM-DD or null/empty to remove deadline
  assignedToUserId: z.string().nullable().optional(),
  assigneeUserIds: z.array(z.string().min(1)).optional(),
})

export async function updateWorkStatus(workId: string, status: z.infer<typeof workStatusSchema>) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')
  const parsedStatus = workStatusSchema.parse(status)

  const updated = await prisma.work.update({
    where: { id: workId },
    data: { status: parsedStatus },
    select: { id: true, clientId: true },
  })

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath('/ped')
  revalidatePath('/profilo')
  revalidatePath(`/works/${updated.id}`)
  revalidatePath(`/clients/${updated.clientId}`)
  return { success: true }
}

/** Aggiornamento parziale lavoro da contesti calendario/PED. */
export async function updateWorkFromPed(workId: string, payload: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')
  const parsed = updateWorkFromPedSchema.parse(payload)

  const current = await prisma.work.findUnique({
    where: { id: workId },
    select: {
      id: true,
      title: true,
      description: true,
      clientId: true,
      categoryId: true,
      status: true,
      priority: true,
      deadline: true,
      assignedToUserId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!current) throw new Error('Lavoro non trovato')

  const mergedDeadline = parsed.deadline !== undefined
    ? (parsed.deadline ?? '')
    : (current.deadline ? current.deadline.toISOString().slice(0, 10) : '')

  const result = await updateWork(workId, {
    title: parsed.title ?? current.title,
    description: parsed.description !== undefined ? (parsed.description ?? '') : (current.description ?? ''),
    clientId: current.clientId,
    categoryId: current.categoryId,
    status: parsed.status ?? current.status,
    priority: parsed.priority !== undefined ? (parsed.priority ?? undefined) : (current.priority ?? undefined),
    deadline: mergedDeadline,
    assignedToUserId:
      parsed.assignedToUserId !== undefined ? parsed.assignedToUserId : (current.assignedToUserId ?? null),
    assigneeUserIds:
      parsed.assigneeUserIds !== undefined ? parsed.assigneeUserIds : current.assignees.map((a) => a.userId),
  })

  revalidatePath('/ped')
  return result
}

export async function getWork(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return unstable_cache(
    async () =>
      prisma.work.findUnique({
        where: { id },
        include: { client: true, category: true, assignedTo: true },
      }),
    ['work', id],
    { revalidate: 60 }
  )()
}

export async function getWorks(filters?: {
  clientId?: string
  categoryId?: string
  status?: string
  deadlineFilter?: 'SCADUTI' | 'IN_SCADENZA_7_GIORNI' | 'TUTTI'
  assignedUserId?: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const where: any = {}

  if (filters?.clientId) {
    where.clientId = filters.clientId
  }

  if (filters?.categoryId) {
    where.categoryId = filters.categoryId
  }

  if (filters?.status) {
    where.status = filters.status
  }

  if (filters?.assignedUserId) {
    where.OR = [
      { assignedToUserId: filters.assignedUserId },
      { assignees: { some: { userId: filters.assignedUserId } } },
    ]
  }

  if (filters?.deadlineFilter === 'SCADUTI') {
    where.deadline = { lt: now }
    where.status = { not: 'DONE' }
  } else if (filters?.deadlineFilter === 'IN_SCADENZA_7_GIORNI') {
    where.deadline = {
      gte: now,
      lte: sevenDaysFromNow,
    }
    where.status = { not: 'DONE' }
  }

  return prisma.work.findMany({
    where,
    include: {
      client: true,
      category: true,
      assignedTo: true,
    },
    orderBy: [
      { deadline: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  })
}

