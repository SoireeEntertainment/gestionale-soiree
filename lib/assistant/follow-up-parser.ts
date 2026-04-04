/**
 * Messaggi ellittici in base al contesto thread (ultimo cliente, lavoro, …).
 */

import { cleanName, type RuleBasedIntent } from '@/lib/assistant/intent-parser'
import type { AssistantThreadContext } from '@/lib/assistant/thread-context'

function extractUserPass(text: string): { username?: string; password?: string } {
  const u = text.match(/(?:username|utente)\s+(\S+)/i)
  const p = text.match(/(?:password|pwd)\s+(\S+)/i)
  return { username: u?.[1], password: p?.[1] }
}

/** Es. "ok, aggiungi anche TikTok username x password y" */
export function tryFollowUpAddCredential(
  message: string,
  ctx: AssistantThreadContext
): RuleBasedIntent | null {
  const lc = ctx.lastClient
  if (!lc) return null
  const m = message
    .trim()
    .match(
      /^(?:ok,?|va bene,?|sì,?|si,?)?\s*(?:aggiungi\s+)?(?:anche\s+)?(?:le\s+)?credenziali\s+(\S+)|^(?:ok,?|va bene,?)?\s*(?:aggiungi\s+)?anche\s+(\S+)/i
    )
  let label: string | undefined
  if (m) {
    label = (m[1] || m[2])?.replace(/[,;:]+$/, '')
  }
  if (!label) return null
  const { username, password } = extractUserPass(message)
  return {
    kind: 'add_client_credential',
    clientName: lc.name,
    label,
    username,
    password,
  }
}

/** Es. "fallo per Oneforall invece" → stesso schema add credenziale con altro cliente se ultima era credenziale */
export function tryFollowUpChangeClient(
  message: string,
  ctx: AssistantThreadContext
): { clientName: string } | null {
  const m = message.match(
    /(?:per|cliente)\s+(.+?)(?:\s+invece|\s*$)/i
  )
  if (!m) return null
  if (!ctx.lastWrite && !ctx.lastCredentialLabel) return null
  if (!/(invece|cambia\s+cliente|per\s+)/i.test(message)) return null
  const name = m[1].replace(/[,;.]$/, '').trim()
  if (name.length < 2) return null
  return { clientName: name }
}

/** Es. "sposta la deadline a lunedì prossimo" con ultimo lavoro noto */
export function tryFollowUpDeadlineOnly(
  message: string,
  ctx: AssistantThreadContext
): RuleBasedIntent | null {
  const w = ctx.lastWork
  const clientName = w?.clientName ?? ctx.lastClient?.name
  if (!w || !clientName) return null
  const m = message.match(
    /(?:sposta|cambia|imposta|metti)\s+(?:la\s+)?deadline\s+(?:al|a|il|al\s+giorno)?\s+(.+)/i
  )
  if (!m) return null
  return {
    kind: 'update_work',
    workHint: w.title,
    clientName,
    deadlineRaw: m[1].trim(),
  }
}

/** Es. "assegnalo a Davide e Cristian" dopo aver creato o citato un lavoro */
export function tryFollowUpAssignWorkUsers(
  message: string,
  ctx: AssistantThreadContext
): RuleBasedIntent | null {
  const w = ctx.lastWork
  if (!w?.id) return null
  const m = message
    .trim()
    .match(/(?:^|\b)(?:assegnalo|assegna(?:lo)?)\s+(?:il\s+lavoro\s+)?(?:a|ad)\s+(.+)/i)
  if (!m) return null
  const names = cleanName(m[1])
  if (names.length < 2) return null
  return { kind: 'assign_work_users_rule', workId: w.id, assigneeNames: names }
}

/** Es. "aggiungi lo step Revisione" sul lastWork */
export function tryFollowUpAddWorkStep(message: string, ctx: AssistantThreadContext): RuleBasedIntent | null {
  const w = ctx.lastWork
  if (!w?.id) return null
  const m = message.trim().match(/(?:aggiungi|inserisci)\s+(?:lo\s+)?step\s+(.+)/i)
  if (!m) return null
  const stepTitle = cleanName(m[1])
  if (stepTitle.length < 1) return null
  return { kind: 'create_work_step_followup', workId: w.id, stepTitle }
}

export function tryParseFollowUpRule(
  message: string,
  ctx: AssistantThreadContext
): RuleBasedIntent | null {
  return (
    tryFollowUpAddCredential(message, ctx) ||
    tryFollowUpAssignWorkUsers(message, ctx) ||
    tryFollowUpAddWorkStep(message, ctx) ||
    tryFollowUpDeadlineOnly(message, ctx) ||
    null
  )
}
