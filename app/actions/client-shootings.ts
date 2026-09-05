'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import {
  clientShootingSchema,
  clientShootingUpdateSchema,
  shootingReelCreateSchema,
  shootingReelUpdateSchema,
} from '@/lib/validations'

export type ShootingReelRow = {
  id: string
  shootingId: string
  topic: string
  published: boolean
  publishedAt: Date | null
  pedTaskId: string | null
  pedTaskDate: string | null
}

export type ClientShootingRow = {
  id: string
  clientId: string
  date: Date
  name: string
  location: string | null
  notes: string | null
  reels: ShootingReelRow[]
  totalReels: number
  publishedReels: number
}

function normalizeTopics(topics: string[]): string[] {
  const cleaned = topics.map((t) => t.trim()).filter(Boolean)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const t of cleaned) {
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(t)
  }
  return unique
}

function parseShootingDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim())
  if (!match) throw new Error('Data shooting non valida')
  return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`)
}

async function requireWriteUser() {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')
  return user
}

function mapShooting(
  s: {
    id: string
    clientId: string
    date: Date
    name: string
    location: string | null
    notes: string | null
    reels: {
      id: string
      shootingId: string
      topic: string
      published: boolean
      publishedAt: Date | null
      pedTasks: { id: string; date: Date }[]
    }[]
  }
): ClientShootingRow {
  const reels: ShootingReelRow[] = s.reels.map((r) => {
    const task = r.pedTasks[0]
    return {
      id: r.id,
      shootingId: r.shootingId,
      topic: r.topic,
      published: r.published,
      publishedAt: r.publishedAt,
      pedTaskId: task?.id ?? null,
      pedTaskDate: task ? task.date.toISOString().slice(0, 10) : null,
    }
  })
  return {
    id: s.id,
    clientId: s.clientId,
    date: s.date,
    name: s.name,
    location: s.location,
    notes: s.notes,
    reels,
    totalReels: reels.length,
    publishedReels: reels.filter((r) => r.published).length,
  }
}

const shootingInclude = {
  reels: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      pedTasks: { select: { id: true, date: true }, take: 1 },
    },
  },
}

export async function getClientShootings(clientId: string): Promise<ClientShootingRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const rows = await prisma.clientShooting.findMany({
    where: { clientId },
    include: shootingInclude,
    orderBy: { date: 'desc' },
  })
  return rows.map(mapShooting)
}

/** Shooting di un cliente per form PED (select mirato). */
export async function getClientShootingsForPed(clientId: string): Promise<
  {
    id: string
    date: string
    name: string
    location: string | null
    reels: {
      id: string
      topic: string
      published: boolean
      linkedPedItemId: string | null
    }[]
  }[]
> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const rows = await prisma.clientShooting.findMany({
    where: { clientId },
    select: {
      id: true,
      date: true,
      name: true,
      location: true,
      reels: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          topic: true,
          published: true,
          pedTasks: { select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  return rows.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    name: s.name,
    location: s.location,
    reels: s.reels.map((r) => ({
      id: r.id,
      topic: r.topic,
      published: r.published,
      linkedPedItemId: r.pedTasks[0]?.id ?? null,
    })),
  }))
}

export async function createClientShooting(input: unknown): Promise<ClientShootingRow> {
  const user = await requireWriteUser()
  const validated = clientShootingSchema.parse(input)
  const topics = normalizeTopics(validated.topics)
  if (topics.length === 0) throw new Error('Aggiungi almeno un argomento Reel')

  const client = await prisma.client.findUnique({ where: { id: validated.clientId }, select: { id: true } })
  if (!client) throw new Error('Cliente non trovato')

  const created = await prisma.clientShooting.create({
    data: {
      clientId: validated.clientId,
      date: parseShootingDate(validated.date),
      name: validated.name.trim(),
      location: validated.location?.trim() || null,
      notes: validated.notes?.trim() || null,
      reels: {
        create: topics.map((topic) => ({ topic })),
      },
    },
    include: shootingInclude,
  })

  console.info('[ClientShooting] created', { userId: user.id, shootingId: created.id, clientId: validated.clientId })
  revalidatePath(`/clients/${validated.clientId}`)
  return mapShooting(created)
}

export async function updateClientShooting(shootingId: string, input: unknown): Promise<ClientShootingRow> {
  const user = await requireWriteUser()
  const validated = clientShootingUpdateSchema.parse(input)

  const existing = await prisma.clientShooting.findUnique({
    where: { id: shootingId },
    include: { reels: { include: { pedTasks: { select: { id: true } } } } },
  })
  if (!existing) throw new Error('Shooting non trovato')

  const data: { date?: Date; name?: string; location?: string | null; notes?: string | null } = {}
  if (validated.date !== undefined) data.date = parseShootingDate(validated.date)
  if (validated.name !== undefined) data.name = validated.name.trim()
  if (validated.location !== undefined) data.location = validated.location?.trim() || null
  if (validated.notes !== undefined) data.notes = validated.notes?.trim() || null

  if (validated.topics) {
    const topics = normalizeTopics(validated.topics)
    if (topics.length === 0) throw new Error('Aggiungi almeno un argomento Reel')

    const existingByTopic = new Map(existing.reels.map((r) => [r.topic.trim().toLowerCase(), r]))
    const keepIds = new Set<string>()
    const toCreate: string[] = []

    for (const topic of topics) {
      const key = topic.toLowerCase()
      const found = existingByTopic.get(key)
      if (found) {
        keepIds.add(found.id)
        if (found.topic !== topic) {
          await prisma.shootingReel.update({ where: { id: found.id }, data: { topic } })
        }
      } else {
        toCreate.push(topic)
      }
    }

    const toDelete = existing.reels.filter((r) => !keepIds.has(r.id))
    const linkedCount = toDelete.filter((r) => r.pedTasks.length > 0).length
    if (linkedCount > 0) {
      // Detach PED links then delete
      for (const reel of toDelete) {
        if (reel.pedTasks.length > 0) {
          await prisma.pedItem.updateMany({
            where: { shootingReelId: reel.id },
            data: { shootingReelId: null },
          })
        }
      }
    }
    if (toDelete.length > 0) {
      await prisma.shootingReel.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      })
    }
    if (toCreate.length > 0) {
      await prisma.shootingReel.createMany({
        data: toCreate.map((topic) => ({ shootingId, topic })),
      })
    }
  }

  const updated = await prisma.clientShooting.update({
    where: { id: shootingId },
    data,
    include: shootingInclude,
  })

  console.info('[ClientShooting] updated', { userId: user.id, shootingId })
  revalidatePath(`/clients/${existing.clientId}`)
  revalidatePath('/ped')
  return mapShooting(updated)
}

export async function deleteClientShooting(shootingId: string): Promise<{ linkedCount: number }> {
  const user = await requireWriteUser()
  const existing = await prisma.clientShooting.findUnique({
    where: { id: shootingId },
    include: { reels: { include: { pedTasks: { select: { id: true } } } } },
  })
  if (!existing) throw new Error('Shooting non trovato')

  const linkedCount = existing.reels.filter((r) => r.pedTasks.length > 0).length
  // onDelete SetNull on ped_items.shootingReelId handles unlink when reels cascade-delete
  await prisma.clientShooting.delete({ where: { id: shootingId } })

  console.info('[ClientShooting] deleted', { userId: user.id, shootingId, linkedCount })
  revalidatePath(`/clients/${existing.clientId}`)
  revalidatePath('/ped')
  return { linkedCount }
}

export async function createShootingReel(shootingId: string, topic: string): Promise<ShootingReelRow> {
  const user = await requireWriteUser()
  const validated = shootingReelCreateSchema.parse({ topic })
  const shooting = await prisma.clientShooting.findUnique({
    where: { id: shootingId },
    include: { reels: { select: { topic: true } } },
  })
  if (!shooting) throw new Error('Shooting non trovato')

  const dup = shooting.reels.some(
    (r) => r.topic.trim().toLowerCase() === validated.topic.trim().toLowerCase()
  )
  if (dup) throw new Error('Argomento già presente in questo shooting')

  const created = await prisma.shootingReel.create({
    data: { shootingId, topic: validated.topic.trim() },
    include: { pedTasks: { select: { id: true, date: true }, take: 1 } },
  })

  console.info('[ShootingReel] created', { userId: user.id, reelId: created.id })
  revalidatePath(`/clients/${shooting.clientId}`)
  return {
    id: created.id,
    shootingId: created.shootingId,
    topic: created.topic,
    published: created.published,
    publishedAt: created.publishedAt,
    pedTaskId: created.pedTasks[0]?.id ?? null,
    pedTaskDate: created.pedTasks[0]?.date.toISOString().slice(0, 10) ?? null,
  }
}

export async function updateShootingReel(
  reelId: string,
  input: unknown
): Promise<ShootingReelRow> {
  const user = await requireWriteUser()
  const validated = shootingReelUpdateSchema.parse(input)
  const existing = await prisma.shootingReel.findUnique({
    where: { id: reelId },
    include: {
      shooting: { select: { clientId: true, id: true } },
      pedTasks: { select: { id: true, date: true }, take: 1 },
    },
  })
  if (!existing) throw new Error('Argomento Reel non trovato')

  if (validated.topic !== undefined) {
    const siblings = await prisma.shootingReel.findMany({
      where: { shootingId: existing.shootingId, id: { not: reelId } },
      select: { topic: true },
    })
    const dup = siblings.some(
      (r) => r.topic.trim().toLowerCase() === validated.topic!.trim().toLowerCase()
    )
    if (dup) throw new Error('Argomento già presente in questo shooting')
  }

  const data: { topic?: string; published?: boolean; publishedAt?: Date | null } = {}
  if (validated.topic !== undefined) data.topic = validated.topic.trim()
  if (validated.published !== undefined) {
    data.published = validated.published
    if (validated.published) {
      data.publishedAt = existing.publishedAt ?? new Date()
    } else {
      data.publishedAt = null
    }
  }

  const updated = await prisma.shootingReel.update({
    where: { id: reelId },
    data,
    include: { pedTasks: { select: { id: true, date: true }, take: 1 } },
  })

  console.info('[ShootingReel] updated', { userId: user.id, reelId })
  revalidatePath(`/clients/${existing.shooting.clientId}`)
  revalidatePath('/ped')
  return {
    id: updated.id,
    shootingId: updated.shootingId,
    topic: updated.topic,
    published: updated.published,
    publishedAt: updated.publishedAt,
    pedTaskId: updated.pedTasks[0]?.id ?? null,
    pedTaskDate: updated.pedTasks[0]?.date.toISOString().slice(0, 10) ?? null,
  }
}

export async function deleteShootingReel(reelId: string): Promise<{ wasLinked: boolean }> {
  const user = await requireWriteUser()
  const existing = await prisma.shootingReel.findUnique({
    where: { id: reelId },
    include: {
      shooting: { select: { clientId: true } },
      pedTasks: { select: { id: true } },
    },
  })
  if (!existing) throw new Error('Argomento Reel non trovato')

  const wasLinked = existing.pedTasks.length > 0
  // SetNull on ped items via FK
  await prisma.shootingReel.delete({ where: { id: reelId } })

  console.info('[ShootingReel] deleted', { userId: user.id, reelId, wasLinked })
  revalidatePath(`/clients/${existing.shooting.clientId}`)
  revalidatePath('/ped')
  return { wasLinked }
}

export async function setShootingReelPublished(reelId: string, published: boolean): Promise<ShootingReelRow> {
  return updateShootingReel(reelId, { published })
}

/** Conteggio collegamenti PED per conferma eliminazione shooting. */
export async function countShootingPedLinks(shootingId: string): Promise<number> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  return prisma.pedItem.count({
    where: { shootingReel: { shootingId } },
  })
}
