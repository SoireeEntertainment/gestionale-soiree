import { prisma } from '@/lib/prisma'

function sameDeadline(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.getTime() === b.getTime()
}

/**
 * Registra una modifica alla data di consegna.
 * Imposta originalDeadline solo la prima volta che viene valorizzata.
 */
export async function recordWorkDueDateChange(input: {
  workId: string
  previousDeadline: Date | null
  newDeadline: Date | null
  changedByUserId: string
  note?: string | null
}): Promise<void> {
  if (sameDeadline(input.previousDeadline, input.newDeadline)) return

  const current = await prisma.work.findUnique({
    where: { id: input.workId },
    select: { originalDeadline: true },
  })
  if (!current) return

  const isFirstDeadline = !current.originalDeadline && !!input.newDeadline
  const isOriginal = isFirstDeadline && !input.previousDeadline

  await prisma.$transaction(async (tx) => {
    if (isFirstDeadline) {
      await tx.work.update({
        where: { id: input.workId },
        data: { originalDeadline: input.newDeadline },
      })
    }

    await tx.workDueDateHistory.create({
      data: {
        workId: input.workId,
        previousDeadline: input.previousDeadline,
        newDeadline: input.newDeadline,
        changedByUserId: input.changedByUserId,
        note: input.note?.trim() || null,
        isOriginal,
      },
    })
  })
}

export async function getWorkDueDateHistory(workId: string) {
  return prisma.workDueDateHistory.findMany({
    where: { workId },
    orderBy: [{ isOriginal: 'desc' }, { changedAt: 'asc' }],
    include: {
      changedBy: { select: { id: true, name: true } },
    },
  })
}
