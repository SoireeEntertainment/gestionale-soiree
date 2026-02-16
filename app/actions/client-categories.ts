'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { clientCategorySchema } from '@/lib/validations'

export async function upsertClientCategory(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = clientCategorySchema.parse(data)
  
  const clientCategory = await prisma.clientCategory.upsert({
    where: {
      clientId_categoryId: {
        clientId: validated.clientId,
        categoryId: validated.categoryId,
      },
    },
    update: {
      status: validated.status,
      notes: validated.notes,
    },
    create: validated,
    include: {
      client: true,
      category: true,
    },
  })

  revalidatePath(`/clients/${validated.clientId}`)
  revalidatePath(`/categories/${validated.categoryId}`)
  return { success: true, clientCategory }
}

export async function updateClientCategoryStatus(
  clientId: string,
  categoryId: string,
  status: string
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const clientCategory = await prisma.clientCategory.update({
    where: {
      clientId_categoryId: {
        clientId,
        categoryId,
      },
    },
    data: { status: status as any },
  })

  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/categories/${categoryId}`)
  return { success: true, clientCategory }
}

