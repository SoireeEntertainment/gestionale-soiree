'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { workSchema } from '@/lib/validations'
import { parseDeadlineFromInput } from '@/lib/date-utils'
import { dateOnlyToDbDate, formatDateOnly } from '@/lib/timeline-dates'
import { sendWorkAssignedEmail } from '@/lib/work-assignment-email'
import { createDefaultWorkStepsForCategory } from '@/app/actions/work-steps'
import { applyWorkDeadlineFilter } from '@/lib/work-deadline-filter'

function parseWorkDateField(value: string | undefined | null): Date | null {
  if (!value || typeof value !== 'string' || value.trim() === '') return null
  const trimmed = value.trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return dateOnlyToDbDate(trimmed)
  return parseDeadlineFromInput(value)
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
}

async function getCurrentAssigneeIdsForWork(workId: string): Promise<string[]> {
  const row = await prisma.work.findUnique({
    where: { id: workId },
    select: {
      assignedToUserId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!row) return []
  return uniqueIds([row.assignedToUserId, ...row.assignees.map((a) => a.userId)])
}

async function notifyUsersAssignedToWork(workId: string, assigneeUserIds: string[]): Promise<void> {
  const uniqueAssignees = uniqueIds(assigneeUserIds)
  if (uniqueAssignees.length === 0) return

  const [work, users] = await Promise.all([
    prisma.work.findUnique({
      where: { id: workId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        deadline: true,
        client: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: uniqueAssignees }, isActive: true },
      select: { id: true, name: true, email: true },
    }),
  ])
  if (!work) return

  const recipients = users.filter((u) => !!u.email?.trim())
  if (recipients.length === 0) return

  const results = await Promise.allSettled(
    recipients.map((u) =>
      sendWorkAssignedEmail({
        user: { id: u.id, name: u.name, email: u.email },
        work,
      })
    )
  )

  results.forEach((result, i) => {
    const recipient = recipients[i]
    if (result.status === 'fulfilled') {
      console.info('[work-assignment-email] sent', {
        workId: work.id,
        userId: recipient.id,
        email: recipient.email,
        status: 'sent',
        createdAt: new Date().toISOString(),
      })
    } else {
      console.error('[work-assignment-email] failed', {
        workId: work.id,
        userId: recipient.id,
        email: recipient.email,
        status: 'failed',
        createdAt: new Date().toISOString(),
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })
}

export async function createWork(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseWorkDateField(validated.deadline ?? undefined)
  const startDateParsed =
    parseWorkDateField(validated.startDate ?? undefined) ?? dateOnlyToDbDate(formatDateOnly(new Date()))
  const { assigneeUserIds, startDate: _start, deadline: _deadline, ...workFields } = validated

  const work = await prisma.work.create({
    data: {
      ...workFields,
      startDate: startDateParsed,
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

  // Non blocca la creazione: eventuali errori email vengono solo loggati.
  try {
    if (list.length > 0) await notifyUsersAssignedToWork(work.id, list)
  } catch (emailErr) {
    console.error('[createWork] notification error', { workId: work.id, error: emailErr })
  }

  try {
    await createDefaultWorkStepsForCategory(work.id, validated.categoryId)
  } catch (stepsErr) {
    console.error('[createWork] default steps error', { workId: work.id, error: stepsErr })
  }

  revalidatePath('/works')
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
  revalidatePath('/profilo')
  revalidatePath(`/works/${workId}`)
}

export async function updateWork(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseWorkDateField(validated.deadline ?? undefined)
  const startDateParsed = parseWorkDateField(validated.startDate ?? undefined)
  const { assigneeUserIds, startDate: _start, deadline: _deadline, ...workFields } = validated

  const previousAssigneeIds = await getCurrentAssigneeIdsForWork(id)

  const work = await prisma.work.update({
    where: { id },
    data: {
      ...workFields,
      ...(startDateParsed ? { startDate: startDateParsed } : {}),
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

  try {
    const currentAssigneeIds = await getCurrentAssigneeIdsForWork(id)
    const previousSet = new Set(previousAssigneeIds)
    const newlyAdded = currentAssigneeIds.filter((uid) => !previousSet.has(uid))
    if (newlyAdded.length > 0) {
      await notifyUsersAssignedToWork(id, newlyAdded)
    }
  } catch (emailErr) {
    console.error('[updateWork] notification error', { workId: id, error: emailErr })
  }

  revalidatePath('/works')
  revalidatePath('/profilo')
  revalidatePath(`/works/${id}`)
  revalidatePath(`/clients/${validated.clientId}`)
  return { success: true, work }
}

const updateWorkDatesSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => d.startDate <= d.deadline, {
    message: 'La data di partenza deve essere precedente o uguale alla scadenza',
  })

export async function updateWorkDates(
  workId: string,
  data: unknown
): Promise<{ success: true; startDate: string; deadline: string }> {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = updateWorkDatesSchema.parse(data)

  await prisma.work.update({
    where: { id: workId },
    data: {
      startDate: dateOnlyToDbDate(validated.startDate),
      deadline: dateOnlyToDbDate(validated.deadline),
    },
    select: { id: true, startDate: true, deadline: true, clientId: true },
  })

  revalidatePath('/works')
  revalidatePath(`/works/${workId}`)

  return {
    success: true,
    startDate: validated.startDate,
    deadline: validated.deadline,
  }
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

  const where: Record<string, unknown> = {}

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

  applyWorkDeadlineFilter(where, filters?.deadlineFilter)

  return prisma.work.findMany({
    where,
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
      createdAt: true,
      updatedAt: true,
      client: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      steps: { select: { status: true } },
    },
    orderBy: [
      { deadline: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  })
}

