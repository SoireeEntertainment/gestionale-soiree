'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser, canWrite, type CurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getDefaultStepTitlesForCategory } from '@/lib/work-step-templates'

const workIdSchema = z.string().min(1)
const stepIdSchema = z.string().min(1)
const stepTitleSchema = z.string().min(1, 'Il titolo è obbligatorio').max(200)

const createWorkStepInputSchema = z.object({
  workId: workIdSchema,
  title: stepTitleSchema,
})

const updateWorkStepInputSchema = z.object({
  stepId: stepIdSchema,
  title: stepTitleSchema.optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['TODO', 'DONE', 'BLOCKED']).optional(),
  completedAt: z.date().nullable().optional(),
})

const reorderWorkStepsInputSchema = z.object({
  workId: workIdSchema,
  orderedStepIds: z.array(stepIdSchema).min(1),
})

const categoryInputSchema = z.string().min(1)

async function getWorkWithAssignees(workId: string) {
  return prisma.work.findUnique({
    where: { id: workId },
    select: {
      id: true,
      categoryId: true,
      assignedToUserId: true,
      category: { select: { name: true } },
      assignees: { select: { userId: true } },
      _count: { select: { steps: true } },
    },
  })
}

async function resolveCategoryName(categoryIdOrName: string): Promise<string | null> {
  const byId = await prisma.category.findUnique({
    where: { id: categoryIdOrName },
    select: { name: true },
  })
  if (byId) return byId.name

  const byName = await prisma.category.findFirst({
    where: { name: { equals: categoryIdOrName, mode: 'insensitive' } },
    select: { name: true },
  })
  return byName?.name ?? categoryIdOrName
}

function isUserAssignedToWork(
  user: CurrentUser,
  work: { assignedToUserId: string | null; assignees: { userId: string }[] }
): boolean {
  if (work.assignedToUserId === user.id) return true
  return work.assignees.some((a) => a.userId === user.id)
}

async function assertCanManageWorkSteps(workId: string, user: CurrentUser): Promise<void> {
  if (canWrite(user)) return
  const work = await getWorkWithAssignees(workId)
  if (!work || !isUserAssignedToWork(user, work)) {
    throw new Error('Non autorizzato')
  }
}

function revalidateWorkPaths(workId: string) {
  revalidatePath(`/works/${workId}`)
  revalidatePath('/works')
  revalidatePath('/profilo')
}

export async function getWorkSteps(workId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  workIdSchema.parse(workId)

  return prisma.workStep.findMany({
    where: { workId },
    orderBy: { sortOrder: 'asc' },
    include: {
      completedBy: { select: { id: true, name: true } },
    },
  })
}

/** Genera gli step predefiniti per categoria. Non duplica se esistono già (salvo force). */
export async function createDefaultWorkStepsForCategory(
  workId: string,
  category: string,
  options?: { force?: boolean }
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  workIdSchema.parse(workId)
  categoryInputSchema.parse(category)

  const work = await getWorkWithAssignees(workId)
  if (!work) throw new Error('Lavoro non trovato')

  if (work._count.steps > 0 && !options?.force) {
    return { created: 0, skipped: true as const }
  }

  const categoryName = await resolveCategoryName(category)
  const titles = getDefaultStepTitlesForCategory(categoryName ?? category)
  if (titles.length === 0) {
    return { created: 0, skipped: true as const, reason: 'no_template' as const }
  }

  if (options?.force && work._count.steps > 0) {
    await prisma.workStep.deleteMany({ where: { workId } })
  }

  await prisma.workStep.createMany({
    data: titles.map((title, index) => ({
      workId,
      title,
      sortOrder: index,
      status: 'TODO',
    })),
  })

  revalidateWorkPaths(workId)
  return { created: titles.length, skipped: false as const }
}

/** Genera checklist se il lavoro non ha step. */
export async function generateMissingWorkSteps(workId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  workIdSchema.parse(workId)

  const work = await getWorkWithAssignees(workId)
  if (!work) throw new Error('Lavoro non trovato')
  if (work._count.steps > 0) {
    return { created: 0, skipped: true as const }
  }

  return createDefaultWorkStepsForCategory(workId, work.categoryId)
}

/** Rigenera checklist dalla categoria corrente (sostituisce step esistenti). */
export async function regenerateWorkStepsFromCategory(workId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  workIdSchema.parse(workId)

  const work = await getWorkWithAssignees(workId)
  if (!work) throw new Error('Lavoro non trovato')

  return createDefaultWorkStepsForCategory(workId, work.categoryId, { force: true })
}

export async function toggleWorkStep(workStepId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  stepIdSchema.parse(workStepId)

  const step = await prisma.workStep.findUnique({
    where: { id: workStepId },
    select: { id: true, workId: true, status: true },
  })
  if (!step) throw new Error('Step non trovato')

  await assertCanManageWorkSteps(step.workId, user)

  const isDone = step.status === 'DONE'
  await prisma.workStep.update({
    where: { id: workStepId },
    data: isDone
      ? { status: 'TODO', completedAt: null, completedByUserId: null }
      : { status: 'DONE', completedAt: new Date(), completedByUserId: user.id },
  })

  revalidateWorkPaths(step.workId)
  return { isCompleted: !isDone }
}

export async function createWorkStep(workId: string, title: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = createWorkStepInputSchema.parse({ workId, title })
  await assertCanManageWorkSteps(parsed.workId, user)

  const maxOrder = await prisma.workStep.aggregate({
    where: { workId: parsed.workId },
    _max: { sortOrder: true },
  })

  const step = await prisma.workStep.create({
    data: {
      workId: parsed.workId,
      title: parsed.title.trim(),
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  revalidateWorkPaths(parsed.workId)
  return { id: step.id }
}

export async function updateWorkStep(
  stepId: string,
  data: { title?: string; description?: string | null; status?: string; completedAt?: Date | null }
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const parsed = updateWorkStepInputSchema.parse({ stepId, ...data })

  const step = await prisma.workStep.findUnique({
    where: { id: parsed.stepId },
    select: { workId: true },
  })
  if (!step) throw new Error('Step non trovato')

  await assertCanManageWorkSteps(step.workId, user)

  const updateData: {
    title?: string
    description?: string | null
    status?: string
    completedAt?: Date | null
    completedByUserId?: string | null
  } = {}

  if (parsed.title !== undefined) updateData.title = parsed.title.trim()
  if (parsed.description !== undefined) updateData.description = parsed.description

  if (parsed.status !== undefined) {
    updateData.status = parsed.status
    if (parsed.status === 'DONE') {
      updateData.completedAt = parsed.completedAt ?? new Date()
      updateData.completedByUserId = user.id
    } else if (parsed.status === 'TODO') {
      updateData.completedAt = null
      updateData.completedByUserId = null
    }
  } else if (parsed.completedAt !== undefined) {
    updateData.completedAt = parsed.completedAt
    updateData.status = parsed.completedAt ? 'DONE' : 'TODO'
    updateData.completedByUserId = parsed.completedAt ? user.id : null
  }

  await prisma.workStep.update({
    where: { id: parsed.stepId },
    data: updateData,
  })

  revalidateWorkPaths(step.workId)
}

export async function reorderWorkSteps(workId: string, orderedStepIds: string[]) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  reorderWorkStepsInputSchema.parse({ workId, orderedStepIds })

  const steps = await prisma.workStep.findMany({
    where: { workId },
    select: { id: true },
  })
  const valid = new Set(steps.map((s) => s.id))
  if (orderedStepIds.some((id) => !valid.has(id))) {
    throw new Error('Uno o più step non appartengono a questo lavoro')
  }
  if (orderedStepIds.length !== valid.size) {
    throw new Error('L’elenco degli step non è completo per questo lavoro')
  }

  await prisma.$transaction(
    orderedStepIds.map((id, index) =>
      prisma.workStep.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  )

  revalidateWorkPaths(workId)
}

export async function deleteWorkStep(stepId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  stepIdSchema.parse(stepId)

  const step = await prisma.workStep.findUnique({
    where: { id: stepId },
    select: { workId: true },
  })
  if (!step) throw new Error('Step non trovato')

  await prisma.workStep.delete({ where: { id: stepId } })

  revalidateWorkPaths(step.workId)
}
