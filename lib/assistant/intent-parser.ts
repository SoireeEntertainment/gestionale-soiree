/**
 * Parser rule-based per intent frequenti (italiano).
 * Se non c’è match affidarsi al fallback LLM in orchestrator.
 */

export type RuleBasedIntent =
  | {
      kind: 'add_client_credential'
      clientName: string
      label: string
      username?: string
      password?: string
    }
  | {
      kind: 'create_work'
      categoryName: string
      clientName: string
      title?: string
      deadlineRaw?: string
    }
  | {
      kind: 'create_work_step'
      stepTitle: string
      workHint: string
      clientName: string
    }
  | {
      kind: 'update_work'
      workHint: string
      clientName: string
      deadlineRaw?: string
      newTitle?: string
    }
  | { kind: 'query_active_works'; userName: string }
  | { kind: 'query_renewals'; days: number }
  | { kind: 'query_client_credentials'; clientName: string; labelHint: string }

function cleanName(s: string) {
  return s.replace(/^["'«»]|["'«»]$/g, '').trim()
}

/** Estrae username/password da coda messaggio (ordine flessibile). */
function extractUserPass(text: string): { username?: string; password?: string } {
  const u = text.match(/(?:username|utente)\s+(\S+)/i)
  const p = text.match(/(?:password|pwd)\s+(\S+)/i)
  return {
    username: u?.[1],
    password: p?.[1],
  }
}

export function parseRuleBasedIntent(message: string): RuleBasedIntent | null {
  const m = message.trim()
  const lower = m.toLowerCase()

  // --- Credenziali cliente ---
  if (/credenzial/i.test(m) && /(?:aggiungi|inserisci|salva|registra)/i.test(m)) {
    let clientName: string | undefined
    let label: string | undefined

    const schedaEsatta = m.match(
      /(?:aggiungi|inserisci|salva)\s+alla\s+scheda\s+cliente\s+(.+?)\s+le\s+credenziali\s+(\S+)/i
    )
    if (schedaEsatta) {
      clientName = cleanName(schedaEsatta[1])
      label = schedaEsatta[2].replace(/[,;:]+$/, '')
    }

    const scheda = !clientName
      ? m.match(
          /(?:aggiungi|inserisci|salva)\s+(?:alla\s+)?(?:scheda\s+)?(?:cliente\s+)?(.+?)\s+(?:le\s+)?credenziali\s+(\S+)/i
        )
      : null
    if (scheda) {
      clientName = cleanName(scheda[1])
      label = scheda[2].replace(/[,;:]+$/, '')
    }
    if (!clientName) {
      const alt = m.match(
        /credenziali\s+(\S+)\s+(?:per|del(?:l[ao])?\s*cliente?)\s+(.+?)(?:\s+(?:username|utente|password)|$)/i
      )
      if (alt) {
        label = alt[1].replace(/[,;:]+$/, '')
        clientName = cleanName(alt[2])
      }
    }
    if (clientName && label) {
      const { username, password } = extractUserPass(m)
      return { kind: 'add_client_credential', clientName, label, username, password }
    }
  }

  // --- Query credenziali (read) ---
  if (
    /(?:mostra|mostrami|dammi|elenco|vedi|quali).{0,60}credenzial/i.test(m) ||
    (/credenzial/i.test(m) && /(?:mostra|vedi|dammi|elenco)/i.test(m))
  ) {
    const g = m.match(/le\s+credenziali\s+(\w+)\s+di\s+(.+?)(?:\?|$)/i)
    if (g) {
      return { kind: 'query_client_credentials', labelHint: g[1], clientName: cleanName(g[2]) }
    }
    const g0 = m.match(/credenziali\s+(\w+)\s+di\s+(.+?)(?:\?|$)/i)
    if (g0) {
      return { kind: 'query_client_credentials', labelHint: g0[1], clientName: cleanName(g0[2]) }
    }
    const gAlt = m.match(/credenziali\s+(\w+)(?:\s+di\s+|\s+del\s+cliente\s+)(.+)/i)
    if (gAlt) {
      return { kind: 'query_client_credentials', labelHint: gAlt[1], clientName: cleanName(gAlt[2]) }
    }
    const g2 = m.match(/(?:di|del\s+cliente)\s+(.+?)\s+(?:le\s+)?(?:credenziali|account)\s+(\w+)/i)
    if (g2) {
      return { kind: 'query_client_credentials', clientName: cleanName(g2[1]), labelHint: g2[2] }
    }
  }

  // --- Rinnovi in scadenza ---
  if (/rinnov/i.test(m) && /(?:scadenza|scadono|in scadenza|prossim)/i.test(m)) {
    const d = m.match(/(\d+)\s*giorni/i)
    const days = d ? parseInt(d[1], 10) : 30
    return { kind: 'query_renewals', days: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30 }
  }

  // --- Lavori attivi per utente ---
  if (/lavori?\s+attiv/i.test(m) || (/lavori?/i.test(m) && /attiv/i.test(m))) {
    const u = m.match(/(?:ha|per|assegnat[iae]?\s+a)\s+(.+?)(?:\?|$|\.)/i)
    if (u) {
      return { kind: 'query_active_works', userName: cleanName(u[1]) }
    }
    const uPer = m.match(/(?:lavori?\s+attivi?\s+)?(?:per|a)\s+(.+?)(?:\?|$|\.)/i)
    if (uPer) {
      return { kind: 'query_active_works', userName: cleanName(uPer[1]) }
    }
    const u2 = m.match(/(?:utente|collega|chi)\s+(.+?)(?:\?|$)/i)
    if (u2) return { kind: 'query_active_works', userName: cleanName(u2[1]) }
  }

  // --- Crea lavoro: "lavoro Website per Rinlux" / "crea un lavoro ..." ---
  const createWork =
    m.match(
      /(?:crea(?:re)?|nuovo)\s+(?:un\s+)?lavoro\s+(\S+)\s+per\s+(.+?)(?:\s+con\s+deadline\s+(.+))?$/i
    ) || m.match(/lavoro\s+(\S+)\s+per\s+(.+?)(?:\s+con\s+deadline\s+(.+))?$/i)
  if (createWork && /(?:crea|nuovo|lavoro)/i.test(lower)) {
    const categoryName = createWork[1]
    const rest = createWork[2].replace(/\s+con\s+deadline.*$/i, '').trim()
    const deadlineRaw = createWork[3]?.trim()
    const clientName = cleanName(rest.split(/\s+con\s+/i)[0] || rest)
    if (clientName) {
      return {
        kind: 'create_work',
        categoryName,
        clientName,
        title: categoryName,
        deadlineRaw,
      }
    }
  }

  // --- Aggiungi step ---
  const step = m.match(
    /(?:aggiungi|inserisci)\s+(?:lo\s+)?step\s+(.+?)\s+al\s+lavoro\s+(\S+)\s+di\s+(.+)/i
  )
  if (step) {
    return {
      kind: 'create_work_step',
      stepTitle: cleanName(step[1]),
      workHint: step[2],
      clientName: cleanName(step[3]),
    }
  }

  // --- Modifica deadline lavoro ---
  const upd =
    m.match(
      /(?:sposta|cambia|imposta|aggiorna)\s+(?:la\s+)?deadline\s+(?:del\s+)?(?:lavoro\s+)?(\S+)\s+di\s+(.+?)\s+(?:al|a)\s+(.+)/i
    ) ||
    m.match(
      /deadline\s+(?:del\s+)?(?:lavoro\s+)?(\S+)\s+di\s+(.+?)\s+(?:al|a)\s+(.+)/i
    ) ||
    m.match(/lavoro\s+(\S+)\s+di\s+(.+?)\b.*(?:deadline|scadenza).*(?:al|a)\s+(.+)/i)

  if (upd) {
    return {
      kind: 'update_work',
      workHint: upd[1],
      clientName: cleanName(upd[2]),
      deadlineRaw: upd[3].trim(),
    }
  }

  return null
}
