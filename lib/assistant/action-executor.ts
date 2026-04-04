import { prisma } from '@/lib/prisma'
import type { AssistantResult } from '@/lib/assistant/types'
import type { AssistantUndoSnapshot } from '@/lib/assistant/thread-context'
import {
  createClientPayloadSchema,
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
import { upsertClientCredential, deleteClientCredential } from '@/app/actions/client-credentials'
import { createWork, updateWork, deleteWork } from '@/app/actions/works'
import { createWorkStep, updateWorkStep, deleteWorkStep } from '@/app/actions/work-steps'
import { createClientRenewal, updateClientRenewal } from '@/app/actions/client-renewals'
import { createPedItem, updatePedItem } from '@/app/actions/ped'
import { createClient } from '@/app/actions/clients'

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
  href?: string,
  undo?: AssistantUndoSnapshot
): AssistantResult {
  return { success: true, summary, entityType, entityId, href, undo }
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
      case 'create_client': {
        const p = createClientPayloadSchema.parse(payload)
        const email = (p.email ?? '').trim()
        const data = {
          name: p.name.trim(),
          contactName: (p.contactName ?? '').trim(),
          email,
          phone: (p.phone ?? '').trim(),
          notes: (p.notes ?? '').trim(),
          websiteUrl: '',
          industryCategory: null,
          assignedToUserId: null,
          metaBusinessSuiteUrl: '',
          gestioneInserzioniUrl: '',
        }
        try {
          const { client } = await createClient(data)
          if (process.env.NODE_ENV !== 'production') {
            console.log('[assistant] action executed', { actionType: 'create_client', clientId: client.id, name: client.name })
          }
          await logAssistantAction({
            userId,
            threadId,
            actionType,
            entityType: 'Client',
            entityId: client.id,
            input: data,
            result: { id: client.id, name: client.name },
            status: 'success',
          })
          return ok(
            `Cliente **${client.name}** creato con successo.`,
            'Client',
            client.id,
            `/clients/${client.id}`
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Errore creazione cliente'
          await logAssistantAction({
            userId,
            threadId,
            actionType,
            entityType: 'Client',
            input: data,
            result: { error: msg },
            status: 'failed',
          })
          return fail(msg)
        }
      }

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
        const client = await prisma.client.findUnique({
          where: { id: p.clientId },
          select: { name: true },
        })
        const undo: AssistantUndoSnapshot | undefined =
          row?.id != null
            ? {
                kind: 'create_client_credential',
                entityId: row.id,
                clientId: p.clientId,
                createdAt: new Date().toISOString(),
              }
            : undefined
        return ok(
          `Credenziali **${p.label}** aggiunte a **${client?.name ?? 'cliente'}**.`,
          'ClientCredential',
          row?.id,
          `/clients/${p.clientId}`,
          undo
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
        const undo: AssistantUndoSnapshot = {
          kind: 'create_work',
          entityId: work.id,
          clientId: p.clientId,
          createdAt: new Date().toISOString(),
        }
        return ok(
          `Lavoro **${work.title}** creato per **${work.client.name}** (${work.category.name}).`,
          'Work',
          work.id,
          `/works/${work.id}`,
          undo
        )
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
        const work = await prisma.work.findUnique({
          where: { id: p.workId },
          select: { clientId: true, title: true, client: { select: { name: true } } },
        })
        await logAssistantAction({
          userId,
          threadId,
          actionType,
          entityType: 'WorkStep',
          entityId: id,
          input: p,
          status: 'success',
        })
        const undo: AssistantUndoSnapshot = {
          kind: 'create_work_step',
          entityId: id,
          clientId: work?.clientId ?? '',
          workId: p.workId,
          createdAt: new Date().toISOString(),
        }
        return ok(
          `Step **${p.title}** aggiunto al lavoro **${work?.title ?? p.workId}** (${work?.client.name ?? ''}).`,
          'WorkStep',
          id,
          `/works/${p.workId}`,
          undo
        )
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

/** Annulla l’ultima creazione semplice (credenziale, lavoro, step) se lo snapshot è ancora valido. */
export async function performAssistantUndo(
  userId: string,
  threadId: string | null,
  snap: AssistantUndoSnapshot
): Promise<AssistantResult> {
  try {
    switch (snap.kind) {
      case 'create_client_credential': {
        await deleteClientCredential(snap.entityId, snap.clientId)
        await logAssistantAction({
          userId,
          threadId,
          actionType: 'undo_create_client_credential',
          entityType: 'ClientCredential',
          entityId: snap.entityId,
          input: snap,
          result: { undone: true },
          status: 'success',
        })
        return ok('Ho annullato l’ultima credenziale creata (record eliminato).', 'ClientCredential', snap.entityId, `/clients/${snap.clientId}`)
      }
      case 'create_work': {
        await deleteWork(snap.entityId)
        await logAssistantAction({
          userId,
          threadId,
          actionType: 'undo_create_work',
          entityType: 'Work',
          entityId: snap.entityId,
          input: snap,
          result: { undone: true },
          status: 'success',
        })
        return ok('Ho annullato l’ultimo lavoro creato (eliminato).', 'Work', snap.entityId, `/clients/${snap.clientId}`)
      }
      case 'create_work_step': {
        await deleteWorkStep(snap.entityId)
        const wid = snap.workId ?? ''
        await logAssistantAction({
          userId,
          threadId,
          actionType: 'undo_create_work_step',
          entityType: 'WorkStep',
          entityId: snap.entityId,
          input: snap,
          result: { undone: true },
          status: 'success',
        })
        return ok('Ho annullato l’ultimo step aggiunto.', 'WorkStep', snap.entityId, wid ? `/works/${wid}` : undefined)
      }
      default:
        return fail('Tipo di annullamento non supportato.')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
    await logAssistantAction({
      userId,
      threadId,
      actionType: 'undo_failed',
      entityType: 'Error',
      input: snap,
      result: { error: msg },
      status: 'failed',
    })
    return fail(msg)
  }
}
