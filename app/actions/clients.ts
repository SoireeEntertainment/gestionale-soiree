'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { clientSchema } from '@/lib/validations'

export async function createClient(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = clientSchema.parse(data)
  const dataForDb = {
    ...validated,
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
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = clientSchema.parse(data)
  const dataForDb = {
    ...validated,
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

