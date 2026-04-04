import { prisma } from '@/lib/prisma'
import type { AssistantThreadContext, AssistantUndoSnapshot } from '@/lib/assistant/thread-context'
import type { AssistantResult } from '@/lib/assistant/types'

/** Aggiorna contesto dopo un’azione confermata con successo. */
export async function buildThreadContextAfterConfirmedAction(
  actionType: string,
  payload: Record<string, unknown>,
  result: AssistantResult
): Promise<Partial<AssistantThreadContext>> {
  const patch: Partial<AssistantThreadContext> = {
    lastProposed: null,
  }

  if (!result.success) {
    return patch
  }

  if (result.undo) {
    patch.lastUndo = result.undo as AssistantUndoSnapshot
  }

  const clientId = typeof payload.clientId === 'string' ? payload.clientId : undefined
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } })
    if (client) patch.lastClient = { id: clientId, name: client.name }
  }

  if (actionType === 'create_client') {
    const resolvedId = result.entityId
    if (resolvedId) {
      const client = await prisma.client.findUnique({
        where: { id: resolvedId },
        select: { name: true },
      })
      if (client) {
        patch.lastClient = { id: resolvedId, name: client.name }
        patch.lastWrite = { actionType, clientId: resolvedId, clientName: client.name }
      }
    }
    patch.createClientFlow = null
  }

  if (actionType === 'create_client_credential') {
    const label = typeof payload.label === 'string' ? payload.label : undefined
    if (label) patch.lastCredentialLabel = label
    patch.lastWrite = {
      actionType,
      clientId,
      clientName: patch.lastClient?.name,
      label,
    }
  }

  if (actionType === 'create_work') {
    const workId = result.entityId
    if (workId) {
      const w = await prisma.work.findUnique({
        where: { id: workId },
        select: { title: true, clientId: true, client: { select: { name: true } }, category: { select: { name: true } } },
      })
      if (w) {
        patch.lastWork = {
          id: workId,
          title: w.title,
          clientId: w.clientId,
          clientName: w.client.name,
        }
        patch.lastCategoryHint = w.category.name
        patch.lastWrite = {
          actionType,
          clientId: w.clientId,
          clientName: w.client.name,
          workId,
          categoryName: w.category.name,
        }
      }
    }
  }

  if (actionType === 'create_work_step') {
    const workId = typeof payload.workId === 'string' ? payload.workId : undefined
    if (workId) {
      const w = await prisma.work.findUnique({
        where: { id: workId },
        select: { title: true, clientId: true, client: { select: { name: true } } },
      })
      if (w) {
        patch.lastWork = {
          id: workId,
          title: w.title,
          clientId: w.clientId,
          clientName: w.client.name,
        }
        patch.lastWrite = {
          actionType,
          clientId: w.clientId,
          clientName: w.client.name,
          workId,
        }
      }
    }
  }

  if (actionType === 'update_work') {
    const workId = typeof payload.workId === 'string' ? payload.workId : result.entityId
    if (workId) {
      const w = await prisma.work.findUnique({
        where: { id: workId },
        select: { title: true, clientId: true, client: { select: { name: true } }, category: { select: { name: true } } },
      })
      if (w) {
        patch.lastWork = {
          id: workId,
          title: w.title,
          clientId: w.clientId,
          clientName: w.client.name,
        }
        patch.lastCategoryHint = w.category.name
      }
    }
  }

  return patch
}

export function buildThreadContextForProposedAction(
  actionType: string,
  payload: Record<string, unknown>
): Partial<AssistantThreadContext> {
  const previewSummary = `${actionType} (${Object.keys(payload).join(', ')})`
  return {
    lastProposed: { actionType, previewSummary },
  }
}

export function buildThreadContextAfterUndoSuccess(): Partial<AssistantThreadContext> {
  return { lastUndo: null }
}
