import { z } from 'zod'
import type { AssistantThreadContext } from '@/lib/assistant/thread-context'

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

export const assistantUndoSnapshotSchema = z.object({
  kind: z.enum(['create_client_credential', 'create_work', 'create_work_step']),
  entityId: z.string(),
  clientId: z.string(),
  workId: z.string().optional(),
  createdAt: z.string(),
})

export const assistantResultSchema = z.object({
  success: z.boolean(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  summary: z.string().optional(),
  href: z.string().optional(),
  /** Presente se l’azione può essere annullata (solo alcune create). */
  undo: assistantUndoSnapshotSchema.optional(),
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
  /** Merge sul campo `assistantContext` del thread (lato API). */
  threadContextUpdate?: Partial<AssistantThreadContext> | null
  /** Titolo sidebar suggerito (solo prima conversazione utile). */
  suggestedThreadTitle?: string | null
}

/** Metadata salvato sul messaggio assistant per conferma successiva. */
export type PendingConfirmationMetadata = {
  version: 1
  pendingConfirmationId: string
  actionType: string
  payload: Record<string, unknown>
  preview: string
  /** Per la UI: messaggio ancora in attesa di conferma. */
  mode?: 'needs_confirmation'
}

export function isPendingMetadata(v: unknown): v is PendingConfirmationMetadata {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return o.version === 1 && typeof o.pendingConfirmationId === 'string' && typeof o.actionType === 'string'
}

/** Tipi azione supportati dall'executor (allineati al layer interno). */
export const ASSISTANT_ACTION_TYPES = [
  'create_client',
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
