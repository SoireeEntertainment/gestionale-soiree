'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { categorySchema } from '@/lib/validations'

export async function createCategory(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = categorySchema.parse(data)
  
  const category = await prisma.category.create({
    data: validated,
  })

  revalidatePath('/categories')
  return { success: true, category }
}

export async function updateCategory(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = categorySchema.parse(data)
  
  const category = await prisma.category.update({
    where: { id },
    data: validated,
  })

  revalidatePath('/categories')
  revalidatePath(`/categories/${id}`)
  return { success: true, category }
}

export async function deleteCategory(id: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  await prisma.category.delete({
    where: { id },
  })

  revalidatePath('/categories')
  return { success: true }
}

export async function getCategory(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return unstable_cache(
    async () =>
      prisma.category.findUnique({
        where: { id },
        include: {
          clientCategories: { include: { client: true } },
          works: { include: { client: true }, orderBy: { createdAt: 'desc' } },
        },
      }),
    ['category', id],
    { revalidate: 60 }
  )()
}

