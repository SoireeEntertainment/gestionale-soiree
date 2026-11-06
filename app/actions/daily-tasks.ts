'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getCurrentUser, type CurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { dateOnlyToDbDate, todayDateOnlyRome } from '@/lib/timeline-dates'
import {
  contactTaskTitle,
  defaultNextReactivateDate,
  getContactUniverseStatus,
  getEffectiveTaskStatus,
  isDailyTaskType,
  resolveNextReactivateAt,
  sortDailyTasksByDueDateDesc,
  toDateOnly,
  type DailyTaskDTO,
  type DailyTaskStatus,
  type DailyTaskType,
  type UniverseClientNode,
} from '@/lib/daily-tasks'

function revalidateTaskPaths(_userId: string) {
  revalidatePath('/tasks')
  revalidatePath('/profilo')
  revalidatePath('/ped')
}

function mapTask(row: {
  id: string
  title: string
  type: string
  status: string
  dueDate: Date
  notes: string | null
  userId: string
  clientId: string | null
  completedAt: Date | null
  lastContactedAt: Date | null
  nextReactivateAt: Date | null
  createdAt: Date
  updatedAt: Date
  client?: { id: string; name: string } | null
}): DailyTaskDTO {
  const today = todayDateOnlyRome()
  const effectiveStatus = getEffectiveTaskStatus(row, today)
  return {
    id: row.id,
    title: row.title,
    type: isDailyTaskType(row.type) ? row.type : 'GENERAL',
    status: effectiveStatus,
    dueDate: toDateOnly(row.dueDate)!,
    notes: row.notes,
    userId: row.userId,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    lastContactedAt: toDateOnly(row.lastContactedAt),
    nextReactivateAt: toDateOnly(row.nextReactivateAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function applyLazyReactivations(userId: string) {
  const today = todayDateOnlyRome()
  const candidates = await prisma.dailyTask.findMany({
    where: {
      userId,
      type: 'CONTACT_CLIENT',
      status: 'DONE',
      nextReactivateAt: { not: null, lte: dateOnlyToDbDate(today) },
    },
    select: { id: true, nextReactivateAt: true },
  })

  if (candidates.length === 0) return

  await prisma.$transaction(
    candidates.map((task) =>
      prisma.dailyTask.update({
        where: { id: task.id },
        data: {
          status: 'OPEN',
          completedAt: null,
          dueDate: task.nextReactivateAt ?? dateOnlyToDbDate(today),
        },
      })
    )
  )
}

async function assertOwnsTask(taskId: string, userId: string) {
  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!task || task.userId !== userId) throw new Error('Non autorizzato')
  return task
}

/** ADMIN: qualsiasi cliente. AGENTE: solo clienti assegnati. */
export async function assertCanAccessClient(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      assignedToUserId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!client) throw new Error('Cliente non trovato')
  if (user.role === 'ADMIN') return client

  const allowed =
    client.assignedToUserId === user.id ||
    client.assignees.some((a) => a.userId === user.id)
  if (!allowed) throw new Error('Non autorizzato su questo cliente')
  return client
}

function isUniqueContactViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['GENERAL', 'CONTACT_CLIENT']).default('GENERAL'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientId: z.string().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  nextReactivateAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export async function getDailyTasksForUser(
  ownerUserId: string,
  filters?: {
    status?: 'OPEN' | 'DONE' | 'ALL'
    type?: DailyTaskType | 'ALL'
    clientId?: string
    dueBucket?: 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING'
    q?: string
  }
): Promise<DailyTaskDTO[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (ownerUserId !== user.id && user.role !== 'ADMIN') throw new Error('Non autorizzato')

  await applyLazyReactivations(ownerUserId)

  const where: Record<string, unknown> = { userId: ownerUserId }
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status
  if (filters?.type && filters.type !== 'ALL') where.type = filters.type
  if (filters?.clientId) where.clientId = filters.clientId
  if (filters?.q?.trim()) {
    where.title = { contains: filters.q.trim(), mode: 'insensitive' }
  }

  const today = todayDateOnlyRome()
  if (filters?.dueBucket === 'OVERDUE') {
    where.dueDate = { lt: dateOnlyToDbDate(today) }
    where.status = 'OPEN'
  } else if (filters?.dueBucket === 'TODAY') {
    where.dueDate = dateOnlyToDbDate(today)
  } else if (filters?.dueBucket === 'UPCOMING') {
    where.dueDate = { gt: dateOnlyToDbDate(today) }
  }

  const rows = await prisma.dailyTask.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
  })

  return sortDailyTasksByDueDateDesc(rows.map(mapTask))
}

export async function getMyDailyTasks(filters?: {
  status?: 'OPEN' | 'DONE' | 'ALL'
  type?: DailyTaskType | 'ALL'
  clientId?: string
  dueBucket?: 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING'
  q?: string
}): Promise<DailyTaskDTO[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  return getDailyTasksForUser(user.id, filters)
}

export async function getClientUniverse(userId?: string): Promise<UniverseClientNode[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const ownerId = userId && user.role === 'ADMIN' ? userId : user.id
  await applyLazyReactivations(ownerId)

  const today = todayDateOnlyRome()

  const [contactTasks, assignedClients] = await Promise.all([
    prisma.dailyTask.findMany({
      where: { userId: ownerId, type: 'CONTACT_CLIENT', clientId: { not: null } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    user.role === 'ADMIN'
      ? prisma.client.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : prisma.client.findMany({
          where: {
            OR: [
              { assignedToUserId: ownerId },
              { assignees: { some: { userId: ownerId } } },
            ],
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
  ])

  const byClient = new Map<string, (typeof contactTasks)[number]>()
  for (const task of contactTasks) {
    if (!task.clientId || !task.client) continue
    // Con unique index resta al più uno; in lettura preferiamo comunque OPEN effettivo.
    const existing = byClient.get(task.clientId)
    if (!existing) {
      byClient.set(task.clientId, task)
      continue
    }
    const existingOpen = getEffectiveTaskStatus(existing, today) === 'OPEN'
    const nextOpen = getEffectiveTaskStatus(task, today) === 'OPEN'
    if (nextOpen && !existingOpen) byClient.set(task.clientId, task)
  }

  const clientMap = new Map<string, { id: string; name: string }>()
  for (const c of assignedClients) clientMap.set(c.id, c)
  for (const task of byClient.values()) {
    if (task.client) clientMap.set(task.client.id, task.client)
  }

  const nodes: UniverseClientNode[] = [...clientMap.values()].map((client) => {
    const task = byClient.get(client.id) ?? null
    const status = getContactUniverseStatus(task, today)
    return {
      clientId: client.id,
      clientName: client.name,
      status,
      taskId: task?.id ?? null,
      lastContactedAt: toDateOnly(task?.lastContactedAt ?? null),
      nextReactivateAt: toDateOnly(task?.nextReactivateAt ?? null),
      dueDate: toDateOnly(task?.dueDate ?? null),
    }
  })

  const rank = { red: 0, green: 1, neutral: 2 } as const
  return nodes.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return a.clientName.localeCompare(b.clientName, 'it', { sensitivity: 'base' })
  })
}

async function upsertContactTracker(
  user: CurrentUser,
  input: {
    clientId: string
    dueDate: string
    notes?: string | null
    nextReactivateAt?: string | null
  }
): Promise<DailyTaskDTO> {
  const client = await assertCanAccessClient(user, input.clientId)
  const title = contactTaskTitle(client.name)
  const nextStored = input.nextReactivateAt
    ? dateOnlyToDbDate(resolveNextReactivateAt(input.dueDate, input.nextReactivateAt))
    : dateOnlyToDbDate(defaultNextReactivateDate(input.dueDate))

  const existing = await prisma.dailyTask.findFirst({
    where: {
      userId: user.id,
      type: 'CONTACT_CLIENT',
      clientId: client.id,
    },
    include: { client: { select: { id: true, name: true } } },
  })

  if (existing) {
    const updated = await prisma.dailyTask.update({
      where: { id: existing.id },
      data: {
        title,
        status: 'OPEN',
        dueDate: dateOnlyToDbDate(input.dueDate),
        notes: input.notes?.trim() || null,
        completedAt: null,
        nextReactivateAt: nextStored,
      },
      include: { client: { select: { id: true, name: true } } },
    })
    return mapTask(updated)
  }

  try {
    const created = await prisma.dailyTask.create({
      data: {
        title,
        type: 'CONTACT_CLIENT',
        status: 'OPEN',
        dueDate: dateOnlyToDbDate(input.dueDate),
        notes: input.notes?.trim() || null,
        userId: user.id,
        clientId: client.id,
        nextReactivateAt: nextStored,
      },
      include: { client: { select: { id: true, name: true } } },
    })
    return mapTask(created)
  } catch (error) {
    if (!isUniqueContactViolation(error)) throw error
    const raced = await prisma.dailyTask.findFirst({
      where: { userId: user.id, type: 'CONTACT_CLIENT', clientId: client.id },
      include: { client: { select: { id: true, name: true } } },
    })
    if (!raced) throw error
    const updated = await prisma.dailyTask.update({
      where: { id: raced.id },
      data: {
        title,
        status: 'OPEN',
        dueDate: dateOnlyToDbDate(input.dueDate),
        notes: input.notes?.trim() || null,
        completedAt: null,
        nextReactivateAt: nextStored,
      },
      include: { client: { select: { id: true, name: true } } },
    })
    return mapTask(updated)
  }
}

export async function createDailyTask(input: unknown): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = createSchema.parse(input)

  if (parsed.type === 'CONTACT_CLIENT') {
    if (!parsed.clientId) throw new Error('Seleziona un cliente per “Sentire cliente”')
    const saved = await upsertContactTracker(user, {
      clientId: parsed.clientId,
      dueDate: parsed.dueDate,
      notes: parsed.notes,
      nextReactivateAt: parsed.nextReactivateAt,
    })
    revalidateTaskPaths(user.id)
    return saved
  }

  if (parsed.clientId) {
    await assertCanAccessClient(user, parsed.clientId)
  }

  const created = await prisma.dailyTask.create({
    data: {
      title: parsed.title.trim(),
      type: 'GENERAL',
      status: 'OPEN',
      dueDate: dateOnlyToDbDate(parsed.dueDate),
      notes: parsed.notes?.trim() || null,
      userId: user.id,
      clientId: parsed.clientId || null,
    },
    include: { client: { select: { id: true, name: true } } },
  })
  revalidateTaskPaths(user.id)
  return mapTask(created)
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clientId: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  nextReactivateAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function updateDailyTask(input: unknown): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const parsed = updateSchema.parse(input)
  const current = await assertOwnsTask(parsed.id, user.id)

  if (parsed.clientId) {
    await assertCanAccessClient(user, parsed.clientId)
  }

  if (
    current.type === 'CONTACT_CLIENT' &&
    parsed.clientId &&
    parsed.clientId !== current.clientId
  ) {
    // Cambio cliente su tracker contatto: verifica unicità destinazione
    const clash = await prisma.dailyTask.findFirst({
      where: {
        userId: user.id,
        type: 'CONTACT_CLIENT',
        clientId: parsed.clientId,
        NOT: { id: current.id },
      },
      select: { id: true },
    })
    if (clash) throw new Error('Esiste già un tracker “Sentire cliente” per questo cliente')
  }

  const data: Record<string, unknown> = {}
  if (parsed.title !== undefined) data.title = parsed.title.trim()
  if (parsed.dueDate !== undefined) data.dueDate = dateOnlyToDbDate(parsed.dueDate)
  if (parsed.clientId !== undefined) data.clientId = parsed.clientId
  if (parsed.notes !== undefined) data.notes = parsed.notes?.trim() || null
  if (parsed.nextReactivateAt !== undefined) {
    if (parsed.nextReactivateAt) {
      const anchor =
        toDateOnly(current.lastContactedAt) ??
        todayDateOnlyRome()
      data.nextReactivateAt = dateOnlyToDbDate(
        resolveNextReactivateAt(anchor, parsed.nextReactivateAt)
      )
    } else {
      data.nextReactivateAt = null
    }
  }

  try {
    const updated = await prisma.dailyTask.update({
      where: { id: parsed.id },
      data,
      include: { client: { select: { id: true, name: true } } },
    })
    revalidateTaskPaths(user.id)
    return mapTask(updated)
  } catch (error) {
    if (isUniqueContactViolation(error)) {
      throw new Error('Esiste già un tracker “Sentire cliente” per questo cliente')
    }
    throw error
  }
}

const completeSchema = z.object({
  id: z.string().min(1),
  nextReactivateAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export async function completeDailyTask(input: unknown): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const parsed = completeSchema.parse(input)
  const task = await assertOwnsTask(parsed.id, user.id)
  const contactDate = todayDateOnlyRome()

  if (task.type === 'CONTACT_CLIENT') {
    if (task.clientId) await assertCanAccessClient(user, task.clientId)
    // Scelta utente prevale; altrimenti +7 dal contatto odierno. Mai riusare nextReactivateAt precedente.
    const next = resolveNextReactivateAt(contactDate, parsed.nextReactivateAt)

    const updated = await prisma.dailyTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        lastContactedAt: dateOnlyToDbDate(contactDate),
        nextReactivateAt: dateOnlyToDbDate(next),
      },
      include: { client: { select: { id: true, name: true } } },
    })
    revalidateTaskPaths(user.id)
    return mapTask(updated)
  }

  const updated = await prisma.dailyTask.update({
    where: { id: task.id },
    data: {
      status: 'DONE',
      completedAt: new Date(),
    },
    include: { client: { select: { id: true, name: true } } },
  })
  revalidateTaskPaths(user.id)
  return mapTask(updated)
}

export async function reopenDailyTask(taskId: string): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  await assertOwnsTask(taskId, user.id)

  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: {
      status: 'OPEN',
      completedAt: null,
    },
    include: { client: { select: { id: true, name: true } } },
  })
  revalidateTaskPaths(user.id)
  return mapTask(updated)
}

export async function toggleDailyTask(taskId: string): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const task = await assertOwnsTask(taskId, user.id)
  const effective = getEffectiveTaskStatus(task)
  if (effective === 'DONE') return reopenDailyTask(taskId)
  // CONTACT_CLIENT: il client apre il dialog di riattivazione; fallback server = +7 da oggi
  if (task.type === 'CONTACT_CLIENT') {
    return completeDailyTask({ id: taskId, nextReactivateAt: defaultNextReactivateDate() })
  }
  return completeDailyTask({ id: taskId })
}

export async function deleteDailyTask(taskId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  await assertOwnsTask(taskId, user.id)
  await prisma.dailyTask.delete({ where: { id: taskId } })
  revalidateTaskPaths(user.id)
}

export async function markClientContacted(input: {
  clientId: string
  nextReactivateAt?: string | null
}): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  await assertCanAccessClient(user, input.clientId)
  const today = todayDateOnlyRome()

  const existing = await prisma.dailyTask.findFirst({
    where: { userId: user.id, type: 'CONTACT_CLIENT', clientId: input.clientId },
    orderBy: { updatedAt: 'desc' },
  })

  if (existing) {
    return completeDailyTask({
      id: existing.id,
      nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
    })
  }

  const created = await createDailyTask({
    title: 'Sentire cliente',
    type: 'CONTACT_CLIENT',
    dueDate: today,
    clientId: input.clientId,
    nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
  })
  return completeDailyTask({
    id: created.id,
    nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
  })
}

export type { DailyTaskDTO, DailyTaskStatus, DailyTaskType, UniverseClientNode }
