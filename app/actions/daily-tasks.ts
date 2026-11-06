'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { dateOnlyToDbDate, todayDateOnlyRome } from '@/lib/timeline-dates'
import {
  contactTaskTitle,
  defaultNextReactivateDate,
  getContactUniverseStatus,
  getEffectiveTaskStatus,
  isDailyTaskType,
  sortDailyTasksByDueDateDesc,
  toDateOnly,
  type DailyTaskDTO,
  type DailyTaskStatus,
  type DailyTaskType,
  type UniverseClientNode,
} from '@/lib/daily-tasks'

function revalidateTaskPaths(userId: string) {
  revalidatePath('/tasks')
  revalidatePath('/profilo')
  revalidatePath('/ped')
  revalidatePath(`/profilo`)
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

  // Clienti con task contatto dell'utente + eventuali clienti assegnati (per popolare universo)
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
          take: 120,
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
          take: 120,
        }),
  ])

  const byClient = new Map<string, (typeof contactTasks)[number]>()
  for (const task of contactTasks) {
    if (!task.clientId || !task.client) continue
    const existing = byClient.get(task.clientId)
    if (!existing) {
      byClient.set(task.clientId, task)
      continue
    }
    // Preferisci OPEN effettivo, altrimenti il più recente
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

  // Priorità: red, green, neutral; poi nome
  const rank = { red: 0, green: 1, neutral: 2 } as const
  return nodes.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return a.clientName.localeCompare(b.clientName, 'it', { sensitivity: 'base' })
  })
}

export async function createDailyTask(input: unknown): Promise<DailyTaskDTO> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = createSchema.parse(input)
  const type = parsed.type

  if (type === 'CONTACT_CLIENT') {
    if (!parsed.clientId) throw new Error('Seleziona un cliente per “Sentire cliente”')
    const client = await prisma.client.findUnique({
      where: { id: parsed.clientId },
      select: { id: true, name: true },
    })
    if (!client) throw new Error('Cliente non trovato')

    const existing = await prisma.dailyTask.findFirst({
      where: {
        userId: user.id,
        type: 'CONTACT_CLIENT',
        clientId: client.id,
      },
      orderBy: { updatedAt: 'desc' },
      include: { client: { select: { id: true, name: true } } },
    })

    if (existing) {
      const updated = await prisma.dailyTask.update({
        where: { id: existing.id },
        data: {
          title: contactTaskTitle(client.name),
          status: 'OPEN',
          dueDate: dateOnlyToDbDate(parsed.dueDate),
          notes: parsed.notes?.trim() || null,
          completedAt: null,
          nextReactivateAt: parsed.nextReactivateAt
            ? dateOnlyToDbDate(parsed.nextReactivateAt)
            : existing.nextReactivateAt ?? dateOnlyToDbDate(defaultNextReactivateDate(parsed.dueDate)),
        },
        include: { client: { select: { id: true, name: true } } },
      })
      revalidateTaskPaths(user.id)
      return mapTask(updated)
    }

    const created = await prisma.dailyTask.create({
      data: {
        title: contactTaskTitle(client.name),
        type: 'CONTACT_CLIENT',
        status: 'OPEN',
        dueDate: dateOnlyToDbDate(parsed.dueDate),
        notes: parsed.notes?.trim() || null,
        userId: user.id,
        clientId: client.id,
        nextReactivateAt: dateOnlyToDbDate(
          parsed.nextReactivateAt ?? defaultNextReactivateDate(parsed.dueDate)
        ),
      },
      include: { client: { select: { id: true, name: true } } },
    })
    revalidateTaskPaths(user.id)
    return mapTask(created)
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
  await assertOwnsTask(parsed.id, user.id)

  const data: Record<string, unknown> = {}
  if (parsed.title !== undefined) data.title = parsed.title.trim()
  if (parsed.dueDate !== undefined) data.dueDate = dateOnlyToDbDate(parsed.dueDate)
  if (parsed.clientId !== undefined) data.clientId = parsed.clientId
  if (parsed.notes !== undefined) data.notes = parsed.notes?.trim() || null
  if (parsed.nextReactivateAt !== undefined) {
    data.nextReactivateAt = parsed.nextReactivateAt
      ? dateOnlyToDbDate(parsed.nextReactivateAt)
      : null
  }

  const updated = await prisma.dailyTask.update({
    where: { id: parsed.id },
    data,
    include: { client: { select: { id: true, name: true } } },
  })
  revalidateTaskPaths(user.id)
  return mapTask(updated)
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
  const today = todayDateOnlyRome()

  if (task.type === 'CONTACT_CLIENT') {
    const next =
      parsed.nextReactivateAt ??
      toDateOnly(task.nextReactivateAt) ??
      defaultNextReactivateDate(today)

    const updated = await prisma.dailyTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        lastContactedAt: dateOnlyToDbDate(today),
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
  if (task.type === 'CONTACT_CLIENT') {
    return completeDailyTask({
      id: taskId,
      nextReactivateAt: toDateOnly(task.nextReactivateAt) ?? defaultNextReactivateDate(),
    })
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

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true },
  })
  if (!client) throw new Error('Cliente non trovato')

  const today = todayDateOnlyRome()
  const existing = await prisma.dailyTask.findFirst({
    where: { userId: user.id, type: 'CONTACT_CLIENT', clientId: client.id },
    orderBy: { updatedAt: 'desc' },
  })

  if (existing) {
    return completeDailyTask({
      id: existing.id,
      nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
    })
  }

  const created = await createDailyTask({
    title: contactTaskTitle(client.name),
    type: 'CONTACT_CLIENT',
    dueDate: today,
    clientId: client.id,
    nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
  })
  return completeDailyTask({
    id: created.id,
    nextReactivateAt: input.nextReactivateAt ?? defaultNextReactivateDate(today),
  })
}

export type { DailyTaskDTO, DailyTaskStatus, DailyTaskType, UniverseClientNode }
