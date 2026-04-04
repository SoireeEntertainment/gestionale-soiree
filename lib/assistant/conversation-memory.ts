import type { AssistantThreadContext } from '@/lib/assistant/thread-context'

type Msg = { role: string; content: string; metadata?: unknown }

/** Blocco testo da anteporre al messaggio utente per il modello (memoria conversazionale). */
export function buildConversationMemoryBlock(
  ctx: AssistantThreadContext,
  recentMessages: Msg[],
  opts?: { lastPendingPreview?: string | null }
): string {
  const lines: string[] = ['[Contesto conversazione — usa questi riferimenti se il messaggio è ellittico]']

  if (ctx.lastClient) {
    lines.push(`- Ultimo cliente citato: **${ctx.lastClient.name}** (id: ${ctx.lastClient.id})`)
  }
  if (ctx.lastWork) {
    lines.push(
      `- Ultimo lavoro citato: **${ctx.lastWork.title}** (workId: ${ctx.lastWork.id}, clientId: ${ctx.lastWork.clientId}${ctx.lastWork.clientName ? `, cliente: ${ctx.lastWork.clientName}` : ''})`
    )
  }
  if (ctx.lastCategoryHint) {
    lines.push(`- Ultima categoria lavoro citata: **${ctx.lastCategoryHint}**`)
  }
  if (ctx.lastCredentialLabel) {
    lines.push(`- Ultima etichetta credenziale citata: **${ctx.lastCredentialLabel}**`)
  }
  if (ctx.lastWrite) {
    lines.push(
      `- Ultima azione confermata: **${ctx.lastWrite.actionType}**${ctx.lastWrite.clientName ? ` per cliente ${ctx.lastWrite.clientName}` : ''}${ctx.lastWrite.label ? `, etichetta ${ctx.lastWrite.label}` : ''}${ctx.lastWrite.categoryName ? `, categoria ${ctx.lastWrite.categoryName}` : ''}`
    )
  }
  if (ctx.lastProposed) {
    lines.push(`- Ultima azione proposta (potrebbe essere ancora in sospeso): ${ctx.lastProposed.actionType} — ${ctx.lastProposed.previewSummary}`)
  }
  if (opts?.lastPendingPreview) {
    lines.push(`- Anteprima azione in attesa di conferma: ${opts.lastPendingPreview}`)
  }

  const tail = recentMessages.slice(-6)
  if (tail.length > 0) {
    lines.push('\nUltimi messaggi:')
    for (const m of tail) {
      const prefix = m.role === 'user' ? 'Utente' : 'Assistente'
      const snippet = m.content.replace(/\s+/g, ' ').trim().slice(0, 200)
      lines.push(`- ${prefix}: ${snippet}${m.content.length > 200 ? '…' : ''}`)
    }
  }

  if (lines.length === 1) {
    return ''
  }
  return lines.join('\n')
}
