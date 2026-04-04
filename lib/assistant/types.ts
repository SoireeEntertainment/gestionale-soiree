import { z } from 'zod'

export const assistantResponseModeSchema = z.enum([
  'answer',
  'needs_confirmation',
  'action_result',
  'clarification',
])

export type AssistantResponseMode = z.infer<typeof assistantResponseModeSchema>

export const proposedActionSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
})

export type ProposedAction = z.infer<typeof proposedActionSchema>

export const assistantResultSchema = z.object({
  success: z.boolean(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  summary: z.string().optional(),
  href: z.string().optional(),
})

export type AssistantResult = z.infer<typeof assistantResultSchema>

/** Risposta standard verso il client (chat UI). */
export type AssistantChatResponse = {
  reply: string
  mode: AssistantResponseMode
  proposedAction?: ProposedAction
  result?: AssistantResult
  /** Presente quando serve conferma: id da rimandare in confirmPendingId */
  pendingConfirmationId?: string
  /** Da salvare in `ChatMessage.metadata` per la conferma successiva. */
  confirmationMeta?: PendingConfirmationMetadata
}

/** Metadata salvato sul messaggio assistant per conferma successiva. */
export type PendingConfirmationMetadata = {
  version: 1
  pendingConfirmationId: string
  actionType: string
  payload: Record<string, unknown>
  preview: string
}

export function isPendingMetadata(v: unknown): v is PendingConfirmationMetadata {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return o.version === 1 && typeof o.pendingConfirmationId === 'string' && typeof o.actionType === 'string'
}

/** Tipi azione supportati dall'executor (allineati al layer interno). */
export const ASSISTANT_ACTION_TYPES = [
  'create_client_credential',
  'update_client_credential',
  'create_work',
  'update_work',
  'create_work_step',
  'update_work_step',
  'create_client_renewal',
  'update_client_renewal',
  'create_ped_task',
  'update_ped_task',
] as const

export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number]
