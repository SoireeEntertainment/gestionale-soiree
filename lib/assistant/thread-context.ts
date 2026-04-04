import { prisma } from '@/lib/prisma'

export const ASSISTANT_CONTEXT_VERSION = 1 as const

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
