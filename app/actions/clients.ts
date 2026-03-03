'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { clientSchema } from '@/lib/validations'

const normalizeNameForDuplicate = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

export async function createClient(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) {
    console.warn('[createClient] 401: user=', !!user, 'canWrite=', user ? canWrite(user) : false)
    throw new Error('Non autorizzato')
  }

  const validated = clientSchema.parse(data)
  const normalizedName = normalizeNameForDuplicate(validated.name)
  const existing = await prisma.client.findMany()
  const isDuplicate = existing.some(
    (c) => normalizeNameForDuplicate(c.name) === normalizedName
  )
  if (isDuplicate) throw new Error('Cliente già esistente con questo nome')

  const dataForDb = {
    name: validated.name.trim(),
    contactName: validated.contactName?.trim() || null,
    email: validated.email?.trim() || null,
    phone: validated.phone?.trim() || null,
    notes: validated.notes?.trim() || null,
    websiteUrl: validated.websiteUrl === '' ? null : validated.websiteUrl,
    industryCategory: validated.industryCategory?.trim() || null,
    assignedToUserId: validated.assignedToUserId || null,
    metaBusinessSuiteUrl: validated.metaBusinessSuiteUrl === '' ? null : validated.metaBusinessSuiteUrl,
    gestioneInserzioniUrl: validated.gestioneInserzioniUrl === '' ? null : validated.gestioneInserzioniUrl,
  }
  const client = await prisma.client.create({
    data: dataForDb,
  })

  revalidatePath('/clients')
  revalidatePath('/ped')
  return { success: true, client }
}

export async function updateClient(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) {
    console.warn('[updateClient] 401: clientId=', id, 'user=', !!user)
    throw new Error('Non autorizzato')
  }

  const validated = clientSchema.parse(data)
  const dataForDb = {
    name: validated.name.trim(),
    contactName: validated.contactName?.trim() || null,
    email: validated.email?.trim() || null,
    phone: validated.phone?.trim() || null,
    notes: validated.notes?.trim() || null,
    websiteUrl: validated.websiteUrl === '' ? null : validated.websiteUrl,
    industryCategory: validated.industryCategory?.trim() || null,
    assignedToUserId: validated.assignedToUserId || null,
    metaBusinessSuiteUrl: validated.metaBusinessSuiteUrl === '' ? null : validated.metaBusinessSuiteUrl,
    gestioneInserzioniUrl: validated.gestioneInserzioniUrl === '' ? null : validated.gestioneInserzioniUrl,
  }
  const client = await prisma.client.update({
    where: { id },
    data: dataForDb,
  })

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { success: true, client }
}

export async function deleteClient(id: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  await prisma.client.delete({
    where: { id },
  })

  revalidatePath('/clients')
  return { success: true }
}

export async function getClient(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return unstable_cache(
    async () =>
      prisma.client.findUnique({
        where: { id },
        include: {
          assignedTo: true,
          assignees: { include: { user: true } },
          clientCategories: { include: { category: true } },
          works: {
            include: { category: true, assignedTo: true },
            orderBy: { createdAt: 'desc' },
          },
          preventivi: { orderBy: { createdAt: 'desc' }, include: { items: true } },
        },
      }),
    ['client', id],
    { revalidate: 60 }
  )()
}

/** Se il cliente non ha ancora assegnatari, assegna l'utente come OWNER (es. quando aggiunge il cliente al PED). Chiamata da createPedItem. */
export async function ensureClientAssigneeIfNone(clientId: string, userId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { assignees: true },
  })
  if (!client) return
  if (client.assignees.length > 0) return
  if (client.assignedToUserId) return

  await prisma.$transaction([
    prisma.clientAssignee.create({
      data: { clientId, userId, role: 'OWNER' },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: { assignedToUserId: userId },
    }),
  ])
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
}

/** Overview percentuale completamento lavori per categoria (mese corrente). */
export async function getClientCategoryOverview(
  clientId: string,
  year: number,
  month: number
): Promise<{ categoryId: string; categoryName: string; completed: number; total: number }[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  const works = await prisma.work.findMany({
    where: {
      clientId,
      updatedAt: { gte: start, lte: end },
    },
    select: { categoryId: true, status: true },
  })

  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
  return categories.map((cat) => {
    const inCat = works.filter((w) => w.categoryId === cat.id)
    const total = inCat.length
    const completed = inCat.filter((w) => w.status === 'DONE').length
    return { categoryId: cat.id, categoryName: cat.name, completed, total }
  })
}

