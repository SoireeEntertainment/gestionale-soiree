'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { workSchema } from '@/lib/validations'
import { parseDeadlineFromInput } from '@/lib/date-utils'

export async function createWork(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseDeadlineFromInput(validated.deadline ?? undefined)

  const work = await prisma.work.create({
    data: {
      ...validated,
      deadline: deadlineDate,
    },
    include: {
      client: true,
      category: true,
    },
  })

  revalidatePath('/works')
  revalidatePath('/calendar')
  revalidatePath(`/clients/${validated.clientId}`)
  return { success: true, work }
}

export async function updateWork(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = workSchema.parse(data)
  const deadlineDate = parseDeadlineFromInput(validated.deadline ?? undefined)

  const work = await prisma.work.update({
    where: { id },
    data: {
      ...validated,
      deadline: deadlineDate,
    },
    include: {
      client: true,
      category: true,
    },
  })

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

