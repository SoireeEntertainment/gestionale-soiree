'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

export async function getWorkComments(workId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return prisma.workComment.findMany({
    where: { workId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createWorkComment(workId: string, body: string, type = 'COMMENT') {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  await prisma.workComment.create({
    data: { workId, userId: user.id, body: body.trim(), type },
  })

  revalidatePath(`/works/${workId}`)
  revalidatePath('/profilo')
}

