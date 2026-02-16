'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

export async function getWorkSteps(workId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return prisma.workStep.findMany({
    where: { workId },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function createWorkStep(workId: string, title: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const maxOrder = await prisma.workStep.aggregate({
    where: { workId },
    _max: { sortOrder: true },
  })

  await prisma.workStep.create({
    data: {
      workId,
      title,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  revalidatePath(`/works/${workId}`)
  revalidatePath('/profilo')
}

export async function updateWorkStep(
  stepId: string,
  data: { title?: string; status?: string; completedAt?: Date | null }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const step = await prisma.workStep.findUnique({
    where: { id: stepId },
    select: { workId: true },
  })
  if (!step) throw new Error('Step non trovato')

  await prisma.workStep.update({
    where: { id: stepId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.completedAt !== undefined && {
        completedAt: data.completedAt,
        status: data.completedAt ? 'DONE' : 'TODO',
      }),
    },
  })

  revalidatePath(`/works/${step.workId}`)
  revalidatePath('/profilo')
}

export async function deleteWorkStep(stepId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const step = await prisma.workStep.findUnique({
    where: { id: stepId },
    select: { workId: true },
  })
  if (!step) throw new Error('Step non trovato')

  await prisma.workStep.delete({ where: { id: stepId } })

  revalidatePath(`/works/${step.workId}`)
  revalidatePath('/profilo')
}
