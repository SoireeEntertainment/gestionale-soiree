import { telegramLog } from '@/lib/telegram/bot-api'
import { processTelegramUpdate } from '@/lib/telegram/process-update'
import {
  claimNextTelegramJobs,
  markTelegramJobDone,
  markTelegramJobFailed,
  requeueStaleTelegramJobs,
  tryMarkUpdateProcessed,
} from '@/lib/telegram/queue'
import { prisma } from '@/lib/prisma'

export async function drainTelegramJobs(limit = 5): Promise<{ processed: number; failed: number }> {
  await requeueStaleTelegramJobs()
  const jobs = await claimNextTelegramJobs(limit)
  let processed = 0
  let failed = 0

  for (const job of jobs) {
    const updateId = Number(job.updateId)
    try {
      const already = await prisma.telegramProcessedUpdate.findUnique({
        where: { updateId: job.updateId },
      })
      if (already) {
        await markTelegramJobDone(job.id)
        processed++
        continue
      }

      await processTelegramUpdate(job.payload)

      // Marca solo dopo successo → retry sicuro in caso di errore
      await tryMarkUpdateProcessed(updateId)
      await markTelegramJobDone(job.id)
      processed++
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : 'unknown'
      telegramLog('job_failed', { jobId: job.id, message: msg })
      await markTelegramJobFailed(job.id, msg)
    }
  }

  return { processed, failed }
}
