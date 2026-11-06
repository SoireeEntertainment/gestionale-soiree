import { createHash, randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import type { ToolPreview } from '@/lib/assistant-v2/types'
import { redactDeep } from '@/lib/assistant-v2/redact'
import { logAssistantV2Action } from '@/lib/assistant-v2/logging'

function hashPayload(toolName: string, payload: unknown): string {
  return createHash('sha256')
    .update(toolName)
    .update('|')
    .update(JSON.stringify(payload))
    .digest('hex')
}

export async function createPendingAction(input: {
  userId: string
  threadId: string
  toolName: string
  payload: Record<string, unknown>
  preview: ToolPreview
  idempotencyKey?: string
}): Promise<{ pendingId: string; idempotencyKey: string }> {
  const payload = redactDeep(input.payload) as Record<string, unknown>
  const payloadHash = hashPayload(input.toolName, payload)
  const idempotencyKey = input.idempotencyKey?.trim() || randomUUID()
  const expiresAt = new Date(Date.now() + ASSISTANT_V2_LIMITS.pendingTtlMs)

  const existing = await prisma.assistantPendingAction.findUnique({
    where: { idempotencyKey },
  })
  if (existing) {
    return { pendingId: existing.id, idempotencyKey }
  }

  const row = await prisma.assistantPendingAction.create({
    data: {
      userId: input.userId,
      threadId: input.threadId,
      toolName: input.toolName,
      payload: payload as Prisma.InputJsonValue,
      payloadHash,
      preview: input.preview as unknown as Prisma.InputJsonValue,
      status: 'pending',
      idempotencyKey,
      expiresAt,
    },
  })

  await logAssistantV2Action({
    userId: input.userId,
    threadId: input.threadId,
    actionType: input.toolName,
    entityType: 'Pending',
    entityId: row.id,
    payload,
    result: { preview: input.preview },
    status: 'needs_confirmation',
  })

  return { pendingId: row.id, idempotencyKey }
}

export async function getPendingActionForUser(pendingId: string, userId: string) {
  return prisma.assistantPendingAction.findFirst({
    where: { id: pendingId, userId },
  })
}

/**
 * Claim atomico: solo uno può passare da pending → confirmed.
 * Verifica TTL, utente, hash payload immutabile.
 */
export async function claimPendingAction(input: {
  pendingId: string
  userId: string
  threadId: string
}): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof getPendingActionForUser>>> }
  | { ok: false; error: string }
> {
  const now = new Date()
  const updated = await prisma.assistantPendingAction.updateMany({
    where: {
      id: input.pendingId,
      userId: input.userId,
      threadId: input.threadId,
      status: 'pending',
      expiresAt: { gt: now },
    },
    data: {
      status: 'confirmed',
      updatedAt: now,
    },
  })

  if (updated.count === 0) {
    const row = await getPendingActionForUser(input.pendingId, input.userId)
    if (!row) return { ok: false, error: 'Conferma non trovata o non autorizzata.' }
    if (row.status === 'executed') {
      return { ok: false, error: 'Questa operazione è già stata eseguita.' }
    }
    if (row.status === 'cancelled') {
      return { ok: false, error: 'Questa operazione è stata annullata.' }
    }
    if (row.expiresAt <= now || row.status === 'expired') {
      await prisma.assistantPendingAction.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'expired' },
      })
      return { ok: false, error: 'La conferma è scaduta. Ripeti la richiesta.' }
    }
    return { ok: false, error: 'Conferma non più valida.' }
  }

  const row = await getPendingActionForUser(input.pendingId, input.userId)
  if (!row) return { ok: false, error: 'Conferma non trovata.' }
  return { ok: true, row }
}

export async function markPendingExecuted(
  pendingId: string,
  result: unknown
): Promise<void> {
  await prisma.assistantPendingAction.update({
    where: { id: pendingId },
    data: {
      status: 'executed',
      executedAt: new Date(),
      result: redactDeep(result) as Prisma.InputJsonValue,
    },
  })
}

export async function cancelPendingAction(input: {
  pendingId: string
  userId: string
  threadId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const updated = await prisma.assistantPendingAction.updateMany({
    where: {
      id: input.pendingId,
      userId: input.userId,
      threadId: input.threadId,
      status: 'pending',
    },
    data: { status: 'cancelled' },
  })
  if (updated.count === 0) {
    return { ok: false, error: 'Nessuna operazione da annullare.' }
  }
  return { ok: true }
}

export function verifyPayloadHash(toolName: string, payload: unknown, expectedHash: string): boolean {
  return hashPayload(toolName, payload) === expectedHash
}
