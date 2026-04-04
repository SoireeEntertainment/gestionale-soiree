/**
 * Flusso conversazionale "crea nuovo cliente" — non usa resolveSingleClient (evita fallback tipo ricerca).
 */

import { prisma } from '@/lib/prisma'
import type { CreateClientDraft, CreateClientFlowState } from '@/lib/assistant/thread-context'

function logCreateClientDebug(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') console.log('[assistant:create-client]', ...args)
}

export function normalizeNameForDuplicate(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function findExistingClientByNormalizedName(
  name: string
): Promise<{ id: string; name: string } | null> {
  const n = normalizeNameForDuplicate(name)
  if (!n) return null
  const rows = await prisma.client.findMany({ select: { id: true, name: true } })
  const hit = rows.find((c) => normalizeNameForDuplicate(c.name) === n)
  return hit ?? null
}

export function isConfirmLikeMessage(message: string): boolean {
  return /^(sì|si|ok|confermo|va bene|yes|procedi|vai|conferma|crealo)\b/i.test(message.trim())
}

/** Risposte negative esplicite (annulla flusso cliente/lavoro in sospeso). */
export function isRejectLikeMessage(message: string): boolean {
  return /^(no|annulla|lascia\s+stare|non\s+creare|no\s+grazie|stop)\b/i.test(message.trim())
}

/** Primo turno: frasi tipo "aggiungi/crea cliente chiamato X" */
export function parseCreateClientRule(message: string): { initialName?: string } | null {
  const m = message.trim()
  const lower = m.toLowerCase()
  if (!/(aggiungi|crea|nuovo|registra|inserisci).{0,40}cliente/i.test(lower)) return null
  if (/credenzial/i.test(m)) return null

  let initial: string | undefined

  const p1 = m.match(
    /(?:chiamato|chiamata|nome|denominazione)\s*[:\s]+["'«»]?([^"',«»\n]+?)["'«»]?(?:\s*[,.]|$)/i
  )
  if (p1) initial = cleanExtracted(p1[1])

  if (!initial) {
    const p2 = m.match(
      /(?:nuovo|nuova)\s+cliente\s+["'«»]?([^"',«»\n]+?)["'«»]?(?:\s*[,.]|$)/i
    )
    if (p2) initial = cleanExtracted(p2[1])
  }
  if (!initial) {
    const p3 = m.match(/cliente\s+["'«»]?([^"',«»\n]+?)["'«»]?(?:\s*[,.]|$)/i)
    if (p3) initial = cleanExtracted(p3[1])
  }
  if (!initial) {
    const p4 = m.match(/chiamalo\s+["'«»]?([^"',«»\n]+)/i)
    if (p4) initial = cleanExtracted(p4[1])
  }

  return { initialName: initial }
}

function cleanExtracted(s: string): string {
  return s.replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim()
}

/**
 * Estrae/aggiorna campi da messaggi tipo:
 * "nome del cliente prova, contatto prova" / "referente mario" / "email a@b.it"
 */
export function extractCreateClientFields(message: string, prev: CreateClientDraft): CreateClientDraft {
  const next: CreateClientDraft = { ...prev }
  const m = message.trim()

  const nameDelCliente = m.match(
    /nome\s+del\s+cliente\s*[:\s,]+(.+?)(?=,|\s+contatto|\s+referente|\s+email|\s+tel\b|$)/i
  )
  if (nameDelCliente) next.name = cleanExtracted(nameDelCliente[1])

  const clientePrefix = m.match(/^cliente\s+(.+?)(?=,|\s+contatto|\s+referente|$)/i)
  if (clientePrefix && !nameDelCliente) next.name = cleanExtracted(clientePrefix[1])

  const ch = m.match(/chiamalo\s+(.+)$/i)
  if (ch) next.name = cleanExtracted(ch[1])

  const co = m.match(/contatto\s*[:\s,]+(.+?)(?=,|\s+referente|\s+email|$)/i)
  if (co) next.contactName = cleanExtracted(co[1])

  const ref = m.match(/referente\s*[:\s,]+(.+?)(?=,|\s+email|\s+tel\b|$)/i)
  if (ref) next.contactName = cleanExtracted(ref[1])

  const em = m.match(/(?:email|e-mail)\s*[:\s,]+(\S+@\S+)/i)
  if (em) next.email = em[1].trim()

  const ph = m.match(/(?:tel|telefono|cell)\s*[:\s,]+([\d\s+().-]{6,})/i)
  if (ph) next.phone = ph[1].replace(/\s+/g, ' ').trim()

  const no = m.match(/note\s*[:\s,]+(.+)$/i)
  if (no) next.notes = cleanExtracted(no[1])

  return next
}

function draftHasExtras(d: CreateClientDraft): boolean {
  return !!(d.contactName?.trim() || d.email?.trim() || d.phone?.trim() || d.notes?.trim())
}

function draftsEqual(a: CreateClientDraft, b: CreateClientDraft): boolean {
  return (
    (a.name ?? '') === (b.name ?? '') &&
    (a.contactName ?? '') === (b.contactName ?? '') &&
    (a.email ?? '') === (b.email ?? '') &&
    (a.phone ?? '') === (b.phone ?? '') &&
    (a.notes ?? '') === (b.notes ?? '')
  )
}

export type ContinueCreateClientResult =
  | {
      kind: 'needs_confirmation'
      draft: CreateClientDraft
      suggestedThreadTitle?: string | null
    }
  | {
      kind: 'clarify_optional'
      draft: CreateClientDraft
      promptedForOptional: boolean
      reply: string
      suggestedThreadTitle?: string | null
    }
  | {
      kind: 'clarify_name'
      draft: CreateClientDraft
      reply: string
      suggestedThreadTitle?: string | null
    }
  | {
      kind: 'noop_details'
      draft: CreateClientDraft
      promptedForOptional: boolean
      reply: string
      suggestedThreadTitle?: string | null
    }

export function startCreateClientFlowFromRule(
  message: string,
  rule: { initialName?: string }
): CreateClientFlowState {
  let draft: CreateClientDraft = {}
  if (rule.initialName?.trim()) draft.name = cleanExtracted(rule.initialName)
  draft = extractCreateClientFields(message, draft)
  return { status: 'awaiting_details', draft, promptedForOptional: false }
}

/**
 * Continua il flusso awaiting_details dopo merge / conferma testuale.
 */
export function continueCreateClientFlow(params: {
  userMessage: string
  flow: CreateClientFlowState
}): ContinueCreateClientResult {
  const { userMessage, flow } = params
  const confirmLike = isConfirmLikeMessage(userMessage)
  const merged = extractCreateClientFields(userMessage, flow.draft)
  const prompted = flow.promptedForOptional === true
  const hadExtrasBefore = draftHasExtras(flow.draft)
  const extrasAfter = draftHasExtras(merged)

  logCreateClientDebug('continue', {
    confirmLike,
    prompted,
    merged,
    hadExtrasBefore,
    extrasAfter,
    pendingDraftBefore: flow.draft,
  })

  if (!merged.name?.trim()) {
    return {
      kind: 'clarify_name',
      draft: merged,
      reply: 'Come si deve chiamare il nuovo cliente? (nome o ragione sociale)',
      suggestedThreadTitle: null,
    }
  }

  if (confirmLike) {
    return { kind: 'needs_confirmation', draft: merged, suggestedThreadTitle: null }
  }

  if (!prompted && extrasAfter) {
    return { kind: 'needs_confirmation', draft: merged, suggestedThreadTitle: null }
  }

  if (!prompted) {
    return {
      kind: 'clarify_optional',
      draft: merged,
      promptedForOptional: true,
      reply: `Cliente **${merged.name}**. Vuoi aggiungere referente, email o telefono? Oppure rispondi **conferma** per crearlo così com’è.`,
      suggestedThreadTitle: `Nuovo cliente ${merged.name}`,
    }
  }

  const optionalFieldsNew = extrasAfter && (!hadExtrasBefore || !draftsEqual(merged, flow.draft))
  if (optionalFieldsNew) {
    return { kind: 'needs_confirmation', draft: merged, suggestedThreadTitle: null }
  }

  if (!draftsEqual(merged, flow.draft) && merged.name?.trim()) {
    return { kind: 'needs_confirmation', draft: merged, suggestedThreadTitle: null }
  }

  return {
    kind: 'noop_details',
    draft: merged,
    promptedForOptional: true,
    reply:
      'Non ho estratto nuovi dettagli. Rispondi **conferma** per creare il cliente oppure indica referente, email o telefono.',
    suggestedThreadTitle: null,
  }
}

export function formatDuplicateReply(existing: { id: string; name: string }): string {
  return `Esiste già un cliente con nome corrispondente: **${existing.name}**. Vuoi aprire la scheda esistente invece di crearne uno nuovo?\n\nScheda: /clients/${existing.id}`
}
