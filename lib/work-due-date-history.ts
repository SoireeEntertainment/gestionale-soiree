import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type Tx = Prisma.TransactionClient

export function sameDeadline(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.getTime() === b.getTime()
}

export function resolveOriginalDeadline(input: {
  currentOriginal: Date | null
  previousDeadline: Date | null
  newDeadline: Date | null
}): { originalDeadline: Date | null; isOriginalHistory: boolean } {
  const { currentOriginal, previousDeadline, newDeadline } = input
  if (currentOriginal) {
    return { originalDeadline: currentOriginal, isOriginalHistory: false }
  }
  if (newDeadline && !previousDeadline) {
    return { originalDeadline: newDeadline, isOriginalHistory: true }
  }
  if (newDeadline && !currentOriginal) {
    // Prima valorizzazione anche se si “corregge” da null: original = nuova data.
    return { originalDeadline: newDeadline, isOriginalHistory: !previousDeadline }
  }
  return { originalDeadline: null, isOriginalHistory: false }
}

/**
 * Aggiorna scadenza + storico nella stessa transazione.
 * Legge lo stato corrente dentro la tx per gestire aggiornamenti concorrenti:
 * previousDeadline = valore effettivamente presente in DB al momento del commit.
 * originalDeadline non viene mai sovrascritto dopo la prima valorizzazione.
 * Nessun evento se la data non cambia.
 */
export async function applyDeadlineChangeInTransaction(
  tx: Tx,
  input: {
    workId: string
    newDeadline: Date | null
    changedByUserId: string
    note?: string | null
    /** Altri campi Work da aggiornare insieme alla scadenza (stessa riga). */
    workData?: Prisma.WorkUncheckedUpdateInput
  }
): Promise<{ changed: boolean; previousDeadline: Date | null; newDeadline: Date | null }> {
  const current = await tx.work.findUnique({
    where: { id: input.workId },
    select: { deadline: true, originalDeadline: true },
  })
  if (!current) throw new Error('Lavoro non trovato')

  const previousDeadline = current.deadline
  const newDeadline = input.newDeadline
  const deadlineUnchanged = sameDeadline(previousDeadline, newDeadline)
  const { originalDeadline, isOriginalHistory } = resolveOriginalDeadline({
    currentOriginal: current.originalDeadline,
    previousDeadline,
    newDeadline,
  })

  const data: Prisma.WorkUncheckedUpdateInput = {
    ...(input.workData ?? {}),
    deadline: newDeadline,
  }
  if (!current.originalDeadline && originalDeadline) {
    data.originalDeadline = originalDeadline
  }

  await tx.work.update({
    where: { id: input.workId },
    data,
  })

  if (deadlineUnchanged) {
    return { changed: false, previousDeadline, newDeadline }
  }

  await tx.workDueDateHistory.create({
    data: {
      workId: input.workId,
      previousDeadline,
      newDeadline,
      changedByUserId: input.changedByUserId,
      note: input.note?.trim() || null,
      isOriginal: isOriginalHistory,
    },
  })

  return { changed: true, previousDeadline, newDeadline }
}

/**
 * Crea lavoro + eventuale storico originale nella stessa transazione.
 */
export async function createWorkWithDeadlineHistoryInTransaction(
  tx: Tx,
  input: {
    workCreate: Prisma.WorkCreateInput | Prisma.WorkUncheckedCreateInput
    changedByUserId: string
  }
) {
  const work = await tx.work.create({
    data: input.workCreate,
    include: { client: true, category: true },
  })

  if (work.deadline) {
    const original = work.originalDeadline ?? work.deadline
    if (!work.originalDeadline) {
      await tx.work.update({
        where: { id: work.id },
        data: { originalDeadline: original },
      })
    }
    await tx.workDueDateHistory.create({
      data: {
        workId: work.id,
        previousDeadline: null,
        newDeadline: work.deadline,
        changedByUserId: input.changedByUserId,
        isOriginal: true,
      },
    })
  }

  return work
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
