import { prisma } from '@/lib/prisma'

export const ASSISTANT_CONTEXT_VERSION = 1 as const

/** Bozza creazione cliente (flusso conversazionale). */
export type CreateClientDraft = {
  name?: string
  contactName?: string
  email?: string
  phone?: string
  notes?: string
}

export type CreateClientFlowState = {
  status: 'awaiting_details'
  draft: CreateClientDraft
  /** Dopo il primo prompt sui campi opzionali */
  promptedForOptional?: boolean
}

/** Bozza lavoro prima che esista il clientId (create_work con cliente assente). */
export type PendingCreateWorkDraft = {
  title: string
  clientNameHint: string
  categoryNameHint: string
  description: string | null
  status: string | undefined
  priority: string | null
  /** Testo originale o stringa vuota se assente */
  deadlineRaw: string
  assigneeNames: string | null
}

export type PendingWorkMissingClientState = {
  pendingIntent: 'create_work'
  status: 'awaiting_missing_client_confirmation'
  missingClientName: string
  pendingWorkDraft: PendingCreateWorkDraft
}

/** Dopo creazione cliente: serve ancora categoria/deadline per chiudere il lavoro. */
export type PendingWorkCompletionState = {
  reason: 'category' | 'deadline'
  clientId: string
  clientName: string
  baseDraft: PendingCreateWorkDraft
}

/** Snapshot per annullare l’ultima creazione semplice (stesso thread). */
export type AssistantUndoSnapshot = {
  kind: 'create_client_credential' | 'create_work' | 'create_work_step'
  entityId: string
  clientId: string
  workId?: string
  createdAt: string
}

export type AssistantThreadContext = {
  version: typeof ASSISTANT_CONTEXT_VERSION
  lastClient?: { id: string; name: string }
  lastWork?: { id: string; title: string; clientId: string; clientName?: string }
  lastCategoryHint?: string
  lastCredentialLabel?: string
  /** Ultima azione di scrittura confermata (per follow-up). */
  lastWrite?: {
    actionType: string
    clientId?: string
    clientName?: string
    workId?: string
    categoryName?: string
    label?: string
  }
  /** Ultima proposta in attesa (dopo conferma viene azzerata dal messaggio). */
  lastProposed?: { actionType: string; previewSummary: string } | null
  lastUndo?: AssistantUndoSnapshot | null
  /** Flusso attivo "crea cliente" (priorità su ricerche / LLM). */
  createClientFlow?: CreateClientFlowState | null
  /** create_work bloccato: cliente inesistente, in attesa sì/no. */
  pendingWorkWithMissingClient?: PendingWorkMissingClientState | null
  /** Dopo OK utente: creare cliente poi ripristinare questo draft per il lavoro. */
  pendingWorkAfterClient?: PendingCreateWorkDraft | null
  /** Cliente già creato ma serve chiarire categoria o deadline. */
  pendingWorkCompletion?: PendingWorkCompletionState | null
  /** Ultima lettura lavori: risoluzione entità per follow-up (es. «e in ritardo?»). */
  lastResolvedUserId?: string
  lastResolvedUserName?: string
  lastResolvedClientId?: string
  lastResolvedClientName?: string
  lastResolvedWorkId?: string
  /** Es. query_user_works, query_client_works, query_work_steps */
  lastReadIntentType?: string
}

export function parseAssistantThreadContext(raw: unknown): AssistantThreadContext | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== ASSISTANT_CONTEXT_VERSION) return null
  return raw as AssistantThreadContext
}

export function defaultAssistantContext(): AssistantThreadContext {
  return { version: ASSISTANT_CONTEXT_VERSION, lastUndo: null }
}

export function mergeAssistantContext(
  prev: AssistantThreadContext | null,
  patch: Partial<AssistantThreadContext>
): AssistantThreadContext {
  const base = prev && prev.version === ASSISTANT_CONTEXT_VERSION ? { ...prev } : defaultAssistantContext()
  const out = { ...base, ...patch, version: ASSISTANT_CONTEXT_VERSION }
  if (Object.prototype.hasOwnProperty.call(patch, 'lastProposed') && patch.lastProposed === null) {
    delete out.lastProposed
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'lastUndo') && patch.lastUndo === null) {
    out.lastUndo = null
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'createClientFlow') && patch.createClientFlow === null) {
    delete out.createClientFlow
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'pendingWorkWithMissingClient') &&
    patch.pendingWorkWithMissingClient === null
  ) {
    delete out.pendingWorkWithMissingClient
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingWorkAfterClient') && patch.pendingWorkAfterClient === null) {
    delete out.pendingWorkAfterClient
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingWorkCompletion') && patch.pendingWorkCompletion === null) {
    delete out.pendingWorkCompletion
  }
  return out
}

export async function loadThreadAssistantContext(threadId: string): Promise<AssistantThreadContext> {
  const row = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { assistantContext: true },
  })
  return parseAssistantThreadContext(row?.assistantContext) ?? defaultAssistantContext()
}

export async function saveThreadAssistantContext(
  threadId: string,
  ctx: AssistantThreadContext
): Promise<void> {
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { assistantContext: ctx as object },
  })
}

/** Applica un patch parziale al contesto salvato (merge su versione corrente). */
export async function patchThreadAssistantContext(
  threadId: string,
  patch: Partial<AssistantThreadContext> | null | undefined
): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return
  const cur = await loadThreadAssistantContext(threadId)
  const next = mergeAssistantContext(cur, patch)
  await saveThreadAssistantContext(threadId, next)
}
