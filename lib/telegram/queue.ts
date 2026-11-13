import { prisma } from '@/lib/prisma'
import { TELEGRAM_LIMITS } from '@/lib/telegram/config'
import type { TelegramUpdate } from '@/lib/telegram/types'

export async function tryMarkUpdateProcessed(updateId: number): Promise<boolean> {
  try {
    await prisma.telegramProcessedUpdate.create({
      data: { updateId: BigInt(updateId) },
    })
    return true
  } catch {
    // unique violation → già processato
    return false
  }
}

export async function enqueueTelegramUpdate(update: TelegramUpdate): Promise<{
  jobId: string
  created: boolean
}> {
  const updateId = BigInt(update.update_id)
  try {
    const job = await prisma.telegramJob.create({
      data: {
        updateId,
        kind: 'update',
        payload: update as object,
        status: 'pending',
        availableAt: new Date(),
      },
      select: { id: true },
    })
    return { jobId: job.id, created: true }
  } catch {
    const existing = await prisma.telegramJob.findUnique({
      where: { updateId },
      select: { id: true },
    })
    return { jobId: existing?.id || '', created: false }
  }
}

export async function claimNextTelegramJobs(limit = 5): Promise<
  { id: string; updateId: bigint; payload: TelegramUpdate; attempts: number }[]
> {
  const now = new Date()
  const candidates = await prisma.telegramJob.findMany({
    where: {
      status: { in: ['pending', 'failed'] },
      availableAt: { lte: now },
      attempts: { lt: TELEGRAM_LIMITS.jobMaxAttempts },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const claimed: { id: string; updateId: bigint; payload: TelegramUpdate; attempts: number }[] = []
  for (const c of candidates) {
    const res = await prisma.telegramJob.updateMany({
      where: {
        id: c.id,
        status: { in: ['pending', 'failed'] },
        attempts: c.attempts,
      },
      data: {
        status: 'processing',
        lockedAt: now,
        attempts: { increment: 1 },
        updatedAt: now,
      },
    })
    if (res.count === 1) {
      claimed.push({
        id: c.id,
        updateId: c.updateId,
        payload: c.payload as TelegramUpdate,
        attempts: c.attempts + 1,
      })
    }
  }
  return claimed
}

export async function markTelegramJobDone(jobId: string): Promise<void> {
  await prisma.telegramJob.update({
    where: { id: jobId },
    data: { status: 'done', lastError: null, lockedAt: null },
  })
}

export async function markTelegramJobFailed(jobId: string, error: string): Promise<void> {
  const row = await prisma.telegramJob.findUnique({ where: { id: jobId }, select: { attempts: true } })
  const attempts = row?.attempts ?? 1
  const backoffMs = Math.min(15 * 60_000, 2000 * Math.pow(2, attempts))
  const terminal = attempts >= TELEGRAM_LIMITS.jobMaxAttempts
  await prisma.telegramJob.update({
    where: { id: jobId },
    data: {
      status: terminal ? 'failed' : 'pending',
      lastError: error.slice(0, 500),
      availableAt: new Date(Date.now() + backoffMs),
      lockedAt: null,
    },
  })
}

/** Sblocca job processing bloccati (crash / timeout). */
export async function requeueStaleTelegramJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - TELEGRAM_LIMITS.jobLockMs)
  const res = await prisma.telegramJob.updateMany({
    where: { status: 'processing', lockedAt: { lt: cutoff } },
    data: { status: 'pending', availableAt: new Date(), lockedAt: null },
  })
  return res.count
}
