import { prisma } from '@/lib/prisma'
import type { AssistantResult } from '@/lib/assistant/types'
import {
  createClientCredentialPayloadSchema,
  updateClientCredentialPayloadSchema,
  createWorkPayloadSchema,
  updateWorkPayloadSchema,
  createWorkStepPayloadSchema,
  updateWorkStepPayloadSchema,
  createClientRenewalPayloadSchema,
  updateClientRenewalPayloadSchema,
  createPedTaskPayloadSchema,
  updatePedTaskPayloadSchema,
} from '@/lib/assistant/action-schemas'
import { upsertClientCredential } from '@/app/actions/client-credentials'
import { createWork, updateWork } from '@/app/actions/works'
import { createWorkStep, updateWorkStep } from '@/app/actions/work-steps'
import { createClientRenewal, updateClientRenewal } from '@/app/actions/client-renewals'
import { createPedItem, updatePedItem } from '@/app/actions/ped'

export async function logAssistantAction(params: {
  userId: string
  threadId?: string | null
  actionType: string
  entityType: string
  entityId?: string | null
  input: unknown
  result?: unknown
  status: 'success' | 'failed' | 'needs_confirmation'
}): Promise<void> {
  await prisma.assistantActionLog.create({
    data: {
      userId: params.userId,
      threadId: params.threadId ?? undefined,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      input: params.input as object,
      result: params.result === undefined ? undefined : (params.result as object),
      status: params.status,
    },
  })
}

function ok(
  summary: string,
  entityType?: string,
  entityId?: string,
  href?: string
): AssistantResult {
  return { success: true, summary, entityType, entityId, href }
}

function fail(summary: string): AssistantResult {
  return { success: false, summary }
}

export async function executeAssistantAction(
  userId: string,
  threadId: string | null,
  actionType: string,
  payload: unknown
): Promise<AssistantResult> {
  try {
    switch (actionType) {
      case 'create_client_credential': {
        const p = createClientCredentialPayloadSchema.parse(payload)
        await upsertClientCredential(p.clientId, {
          label: p.label,
          username: p.username ?? null,
          password: p.password ?? null,
          notes: p.notes ?? null,
        })
        const row = await prisma.clientCredential.findFirst({
          where: { clientId: p.clientId, label: p.label },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'ClientCredential',
          entityId: row?.id,
          input: { ...p, password: p.password ? '[redacted]' : null },
          result: { id: row?.id },
          status: 'success',
        })
        return ok(
          `Credenziali "${p.label}" salvate per il cliente.`,
          'ClientCredential',
          row?.id,
          `/clients/${p.clientId}`
        )
      }

      case 'update_client_credential': {
        const p = updateClientCredentialPayloadSchema.parse(payload)
        await upsertClientCredential(p.clientId, {
          id: p.credentialId,
          label: p.label,
          username: p.username ?? null,
          password: p.password ?? null,
          notes: p.notes ?? null,
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'ClientCredential',
          entityId: p.credentialId,
          input: { ...p, password: p.password ? '[redacted]' : null },
          status: 'success',
        })
        return ok('Credenziali aggiornate.', 'ClientCredential', p.credentialId, `/clients/${p.clientId}`)
      }

      case 'create_work': {
        const p = createWorkPayloadSchema.parse(payload)
        const { work } = await createWork({
          title: p.title,
          description: p.description ?? '',
          clientId: p.clientId,
          categoryId: p.categoryId,
          status: p.status ?? 'TODO',
          priority: p.priority ?? undefined,
          deadline: p.deadline ?? '',
          assignedToUserId: p.assignedToUserId ?? null,
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'Work',
          entityId: work.id,
          input: p,
          result: { id: work.id },
          status: 'success',
        })
        return ok(`Lavoro "${work.title}" creato.`, 'Work', work.id, `/works/${work.id}`)
      }

      case 'update_work': {
        const patch = updateWorkPayloadSchema.parse(payload)
        const existing = await prisma.work.findUnique({
          where: { id: patch.workId },
          include: { client: true, category: true },
        })
        if (!existing) throw new Error('Lavoro non trovato')
        const deadlineStr =
          patch.deadline !== undefined
            ? patch.deadline ?? ''
            : existing.deadline
              ? existing.deadline.toISOString().slice(0, 10)
              : ''
        const workPayload = {
          title: patch.title ?? existing.title,
          description: patch.description ?? existing.description ?? '',
          clientId: existing.clientId,
          categoryId: existing.categoryId,
          status: (patch.status ?? existing.status) as 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'WAITING_CLIENT' | 'DONE' | 'PAUSED' | 'CANCELED',
          priority: patch.priority ?? existing.priority ?? undefined,
          deadline: deadlineStr,
          assignedToUserId:
            patch.assignedToUserId !== undefined ? patch.assignedToUserId : existing.assignedToUserId,
        }
        await updateWork(patch.workId, workPayload)
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'Work',
          entityId: patch.workId,
          input: patch,
          status: 'success',
        })
        return ok('Lavoro aggiornato.', 'Work', patch.workId, `/works/${patch.workId}`)
      }

      case 'create_work_step': {
        const p = createWorkStepPayloadSchema.parse(payload)
        const { id } = await createWorkStep(p.workId, p.title)
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'WorkStep',
          entityId: id,
          input: p,
          status: 'success',
        })
        return ok(`Step "${p.title}" aggiunto al lavoro.`, 'WorkStep', id, `/works/${p.workId}`)
      }

      case 'update_work_step': {
        const p = updateWorkStepPayloadSchema.parse(payload)
        await updateWorkStep(p.stepId, {
          title: p.title,
          status: p.status,
        })
        const step = await prisma.workStep.findUnique({
          where: { id: p.stepId },
          select: { workId: true },
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'WorkStep',
          entityId: p.stepId,
          input: p,
          status: 'success',
        })
        return ok('Step aggiornato.', 'WorkStep', p.stepId, step ? `/works/${step.workId}` : undefined)
      }

      case 'create_client_renewal': {
        const p = createClientRenewalPayloadSchema.parse(payload)
        const { id } = await createClientRenewal(p.clientId, {
          serviceName: p.serviceName,
          renewalDate: p.renewalDate,
          billingDate: p.billingDate ?? null,
          status: p.status,
          notes: p.notes ?? null,
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'ClientRenewal',
          entityId: id,
          input: p,
          status: 'success',
        })
        return ok(`Rinnovo "${p.serviceName}" registrato.`, 'ClientRenewal', id, `/clients/${p.clientId}`)
      }

      case 'update_client_renewal': {
        const p = updateClientRenewalPayloadSchema.parse(payload)
        await updateClientRenewal(p.renewalId, p.clientId, {
          serviceName: p.serviceName,
          renewalDate: p.renewalDate,
          billingDate: p.billingDate ?? null,
          status: p.status,
          notes: p.notes ?? null,
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'ClientRenewal',
          entityId: p.renewalId,
          input: p,
          status: 'success',
        })
        return ok('Rinnovo aggiornato.', 'ClientRenewal', p.renewalId, `/clients/${p.clientId}`)
      }

      case 'create_ped_task': {
        const p = createPedTaskPayloadSchema.parse(payload)
        const { id } = await createPedItem(p)
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'PedItem',
          entityId: id,
          input: p,
          status: 'success',
        })
        return ok(`Task PED "${p.title}" creata (${p.date}).`, 'PedItem', id, '/ped')
      }

      case 'update_ped_task': {
        const p = updatePedTaskPayloadSchema.parse(payload)
        const { pedItemId, ...patch } = p
        await updatePedItem(pedItemId, patch)
        const item = await prisma.pedItem.findUnique({
          where: { id: pedItemId },
          select: { clientId: true },
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'PedItem',
          entityId: pedItemId,
          input: p,
          status: 'success',
        })
        return ok('Task PED aggiornata.', 'PedItem', pedItemId, item ? `/clients/${item.clientId}` : '/ped')
      }

      default:
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'Unknown',
          input: payload,
          result: { error: 'unknown_action' },
          status: 'failed',
        })
        return fail(`Azione non supportata: ${actionType}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
    await logAssistantAction({
      userId,
      threadId,
      actionType,
      entityType: 'Error',
      input: payload,
      result: { error: msg },
      status: 'failed',
    })
    return fail(msg)
  }
}
