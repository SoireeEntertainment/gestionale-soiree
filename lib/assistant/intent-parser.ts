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
      assigneeNames?: string
    }
  | { kind: 'mark_work_step_done'; stepTitle: string; workHint: string; clientName: string }
  | { kind: 'assign_work_users_rule'; workId: string; assigneeNames: string }
  | { kind: 'create_work_step_followup'; workId: string; stepTitle: string }
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
  | { kind: 'query_client_credentials'; clientName: string; labelHint: string; revealSecrets: boolean }
  | { kind: 'undo_last_action' }
  | { kind: 'query_ped_month_remaining'; clientName: string }
  | { kind: 'query_top_clients_active_works' }
  | { kind: 'query_my_ped_today' }
  | { kind: 'query_clients_active_category_work'; categoryHint: string }
  /** Lettura lavori (query layer) */
  | { kind: 'query_overdue_works' }
  | { kind: 'query_workload'; scope: 'week' | 'month' }
  | {
      kind: 'query_works_entity'
      name: string
      period?: 'today' | 'week' | 'month' | 'next7days'
      overdueOnly?: boolean
    }
  | {
      kind: 'query_client_works_explicit'
      clientName: string
      period?: 'today' | 'week' | 'month' | 'next7days'
      overdueOnly?: boolean
    }
  | {
      kind: 'query_user_works_assigned'
      userName: string
      period?: 'today' | 'week' | 'month' | 'next7days'
      overdueOnly?: boolean
    }
  | { kind: 'query_work_steps'; workHint: string; clientName: string; mode: 'missing' | 'full' }
  | { kind: 'query_work_progress'; workHint: string; clientName: string }
  | { kind: 'query_work_show'; workHint: string; clientName: string }
  | {
      kind: 'query_work_summary'
      clientName?: string
      categoryHint?: string
      period?: 'today' | 'week' | 'month' | 'next7days'
    }
  | { kind: 'query_user_overdue_followup'; userId: string; userName: string }
  | { kind: 'query_work_progress_followup'; workId: string }

export function cleanName(s: string) {
  return s.replace(/^["'«»]|["'«»]$/g, '').trim()
}

function parseWorkPeriodHint(s: string): 'today' | 'week' | 'month' | 'next7days' | undefined {
  if (/questa\s+settimana|in\s+settimana/i.test(s)) return 'week'
  if (/\boggi\b/i.test(s)) return 'today'
  if (/questo\s+mese|nel\s+mese/i.test(s)) return 'month'
  if (/prossim[ia]\s+7|prossime\s+7|7\s+giorni/i.test(s)) return 'next7days'
  return undefined
}

function stripWorkPeriodTokens(s: string): string {
  return cleanName(
    s
      .replace(/\bquesta\s+settimana\b/gi, '')
      .replace(/\bquesto\s+mese\b/gi, '')
      .replace(/\boggi\b/gi, '')
      .replace(/\bprossim[ia]\s+7\s+giorni\b/gi, '')
      .replace(/\b7\s+giorni\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** True se l’utente chiede esplicitamente password / valori in chiaro. */
export function wantsCredentialSecretsInMessage(message: string): boolean {
  return /\b(password|passwords|pwd|in chiaro|valori completi|mostra\s+tutto|mostrami\s+le\s+password|dammi\s+la\s+password)\b/i.test(
    message
  )
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
  const revealCred = wantsCredentialSecretsInMessage(m)

  // --- Annulla ultima azione ---
  if (
    /^(?:annulla|undo|cancella)\s+(?:l[''])?ultima\s+azione\b/i.test(m) ||
    /^annulla\s+ultimo\b/i.test(m)
  ) {
    return { kind: 'undo_last_action' }
  }

  // --- Task PED cliente mese corrente ---
  if (/task|ped/i.test(m) && /mancano|rimangono|quante/i.test(m) && /mese|questo mese|del mese/i.test(m)) {
    const c = m.match(
      /(?:a|per|per il cliente|cliente)\s+(.+?)(?:\s+questo|\s+del|\s*$|\?)/i
    )
    if (c) {
      return { kind: 'query_ped_month_remaining', clientName: cleanName(c[1]) }
    }
  }

  // --- Clienti con più lavori attivi ---
  if (/clienti?\s+con\s+pi[uù]\s+lavori?\s+attiv/i.test(m) || /pi[uù]\s+lavori?\s+attiv.*clienti/i.test(m)) {
    return { kind: 'query_top_clients_active_works' }
  }

  // --- Le mie task oggi ---
  if (/quali\s+task\s+ho\s+oggi/i.test(m) || /^task\s+di\s+oggi\s+per\s+me\b/i.test(m)) {
    return { kind: 'query_my_ped_today' }
  }

  // --- Clienti con lavoro <categoria> attivo ---
  if (/clienti.*lavoro.*attiv/i.test(m) || /hanno.*lavoro.*attiv/i.test(m)) {
    const cat = m.match(/lavoro\s+(\S+)\s+attiv/i) || m.match(/lavoro\s+tipo\s+(\S+)/i)
    if (cat) {
      return { kind: 'query_clients_active_category_work', categoryHint: cat[1] }
    }
  }

  // --- Lettura lavori: in ritardo (globale) ---
  if (
    /(?:qual[ie]|mostra|elenco|dammi).{0,50}lavori.{0,40}(?:in\s+ritardo|scadut|deadline\s+superat)/i.test(
      m
    ) ||
    /lavori.{0,25}(?:in\s+ritardo|con\s+deadline\s+superat|scadut[ei])/i.test(m)
  ) {
    return { kind: 'query_overdue_works' }
  }

  // --- Carico / workload ---
  if (
    /chi\s+è\s+pi[uù]\s+caric|pi[uù]\s+caric[oa]\s+(?:questa|in\s+questa)|carico\s+(?:operativ|di\s+lavoro)/i.test(
      m
    ) ||
    /quanti\s+lavori\s+ha\s+ogni\s+utente/i.test(m)
  ) {
    const scope = /questo\s+mese|del\s+mese/i.test(m) ? 'month' : 'week'
    return { kind: 'query_workload', scope }
  }

  // --- Step / processo / avanzamento ---
  const stepMissing = m.match(
    /(?:qual[ie]|che)\s+step\s+mancano\s+(?:nel|al)\s+(?:lavoro\s+)?(\S+)\s+di\s+(.+?)(?:\?|$)/i
  )
  if (stepMissing) {
    return {
      kind: 'query_work_steps',
      workHint: stepMissing[1],
      clientName: cleanName(stepMissing[2]),
      mode: 'missing',
    }
  }

  const proc = m.match(
    /(?:mostra(?:mi)?|elenco|qual[ie])\s+(?:il\s+)?processo\s+(?:del\s+)?(?:lavoro\s+)?(\S+)\s+di\s+(.+?)(?:\?|$)/i
  )
  if (proc) {
    return {
      kind: 'query_work_steps',
      workHint: proc[1],
      clientName: cleanName(proc[2]),
      mode: 'full',
    }
  }

  const progress = m.match(
    /a\s+che\s+punto\s+(?:è|e'|e’|si\s+trova)\s+(?:il\s+)?lavoro\s+(\S+)\s+di\s+(.+?)(?:\?|$)/i
  )
  if (progress) {
    return {
      kind: 'query_work_progress',
      workHint: progress[1],
      clientName: cleanName(progress[2]),
    }
  }

  const showW = m.match(/mostra(?:mi)?\s+(?:il\s+)?lavoro\s+(\S+)\s+di\s+(.+?)(?:\?|$)/i)
  if (showW) {
    return {
      kind: 'query_work_show',
      workHint: showW[1],
      clientName: cleanName(showW[2]),
    }
  }

  // --- Riepilogo lavori ---
  const sumClient = m.match(
    /(?:riepilogo|riassumi|panoramica).{0,80}lavori.{0,40}(?:di|per)\s+(.+?)(?:\?|$)/i
  )
  if (sumClient) {
    return { kind: 'query_work_summary', clientName: cleanName(sumClient[1]) }
  }
  const sumWeek = /lavori\s+attivi.{0,25}questa\s+settimana|riassumi.{0,40}settimana/i.test(m)
  if (sumWeek) {
    return { kind: 'query_work_summary', period: 'week' }
  }
  const sumCat = m.match(
    /(?:riepilogo|panoramica|riassumi).{0,50}lavori.{0,30}(Website|Social|ADV|PED|Graphic|Shooting|\w[\w-]*)/i
  )
  if (sumCat) {
    return { kind: 'query_work_summary', categoryHint: sumCat[1] }
  }

  // --- Lavori per cliente (esplicito) ---
  const perCliente = m.match(
    /qual[ie]\s+lavori.{0,30}per\s+(?:il\s+)?cliente\s+(.+?)(?:\?|$)/i
  )
  if (perCliente) {
    const tail = perCliente[1]
    const period = parseWorkPeriodHint(tail)
    return {
      kind: 'query_client_works_explicit',
      clientName: stripWorkPeriodTokens(period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail),
      period,
    }
  }

  const abbiamoPer = m.match(
    /(?:qual[ie]|che)\s+lavori\s+abbiamo\s+per\s+(.+?)(?:\?|$)/i
  )
  if (abbiamoPer && !/assegnat/i.test(m)) {
    const tail = abbiamoPer[1].trim()
    const period = parseWorkPeriodHint(tail)
    const name = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (name.length > 1) {
      return { kind: 'query_client_works_explicit', clientName: name, period }
    }
  }

  const qualiPer = m.match(/^qual[ie]\s+lavori\s+per\s+(.+?)(?:\?|$)/im)
  if (qualiPer && !/cliente/i.test(m)) {
    const tail = qualiPer[1].trim()
    const period = parseWorkPeriodHint(tail)
    const name = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (name.length > 1) {
      return { kind: 'query_works_entity', name, period }
    }
  }

  const mostraPer = m.match(/mostra(?:mi)?\s+(?:i\s+)?lavori.{0,12}per\s+(.+?)(?:\?|$)/i)
  if (mostraPer) {
    const tail = mostraPer[1].trim()
    const period = parseWorkPeriodHint(tail)
    const name = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (name.length > 1) {
      return { kind: 'query_works_entity', name, period }
    }
  }

  const qualiDi = m.match(/qual[ie]\s+lavori\s+(?:ci\s+sono\s+)?di\s+(.+?)(?:\?|$)/i)
  if (qualiDi && !/cliente/i.test(qualiDi[1])) {
    const tail = qualiDi[1].trim()
    const period = parseWorkPeriodHint(tail)
    const name = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (name.length > 1) {
      return { kind: 'query_works_entity', name, period }
    }
  }

  // --- Lavori assegnati a utente ---
  const assigned = m.match(/lavori\s+assegnat\w*\s+(?:a|ad)\s+(.+?)(?:\?|$)/i)
  if (assigned) {
    const tail = assigned[1].trim()
    const period = parseWorkPeriodHint(tail)
    const userName = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (userName.length > 1) {
      return { kind: 'query_user_works_assigned', userName, period }
    }
  }

  // --- Quali lavori ha [nome] (utente o cliente) ---
  const haEnt = m.match(/qual[ie]\s+lavori\s+ha\s+(.+?)(?:\?|$)/i)
  if (haEnt) {
    const tail = haEnt[1].trim()
    const period = parseWorkPeriodHint(tail)
    const name = stripWorkPeriodTokens(
      period ? tail.replace(/questa\s+settimana|oggi|questo\s+mese|7\s+giorni|prossim[ia]\s+7/gi, '') : tail
    )
    if (name.length > 1) {
      return { kind: 'query_works_entity', name, period }
    }
  }

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
      return {
        kind: 'query_client_credentials',
        labelHint: g[1],
        clientName: cleanName(g[2]),
        revealSecrets: revealCred,
      }
    }
    const g0 = m.match(/credenziali\s+(\w+)\s+di\s+(.+?)(?:\?|$)/i)
    if (g0) {
      return {
        kind: 'query_client_credentials',
        labelHint: g0[1],
        clientName: cleanName(g0[2]),
        revealSecrets: revealCred,
      }
    }
    const gAlt = m.match(/credenziali\s+(\w+)(?:\s+di\s+|\s+del\s+cliente\s+)(.+)/i)
    if (gAlt) {
      return {
        kind: 'query_client_credentials',
        labelHint: gAlt[1],
        clientName: cleanName(gAlt[2]),
        revealSecrets: revealCred,
      }
    }
    const g2 = m.match(/(?:di|del\s+cliente)\s+(.+?)\s+(?:le\s+)?(?:credenziali|account)\s+(\w+)/i)
    if (g2) {
      return {
        kind: 'query_client_credentials',
        clientName: cleanName(g2[1]),
        labelHint: g2[2],
        revealSecrets: revealCred,
      }
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
    m.match(/(?:crea(?:re)?|nuovo)\s+(?:un\s+)?lavoro\s+(\S+)\s+per\s+(.+)/i) ||
    m.match(/\blavoro\s+(\S+)\s+per\s+(.+)/i)
  if (createWork && /(?:crea|nuovo|\blavoro\b)/i.test(lower)) {
    const categoryName = createWork[1]
    let tail = createWork[2].trim()
    let deadlineRaw: string | undefined
    const dl = tail.match(/\s+con\s+deadline\s+(.+)$/i)
    if (dl) {
      deadlineRaw = dl[1].trim()
      tail = tail.slice(0, dl.index).trim()
    }
    let assigneeNames: string | undefined
    const asn = tail.match(/\s+assegnat[oa]\w*\s+(?:a\s+)?(.+)$/i)
    if (asn) {
      assigneeNames = cleanName(asn[1])
      tail = tail.slice(0, asn.index).trim()
    }
    const clientName = cleanName(tail)
    if (clientName) {
      return {
        kind: 'create_work',
        categoryName,
        clientName,
        title: categoryName,
        deadlineRaw,
        assigneeNames,
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

  // --- Segna step completato ---
  const markStep =
    m.match(
      /(?:segna|marca|imposta)\s+(?:come\s+)?(?:completat[oa]|fatto)\s+(?:lo\s+)?step\s+(.+?)\s+del\s+lavoro\s+(\S+)\s+di\s+(.+)/i
    ) || m.match(/completa\s+(?:lo\s+)?step\s+(.+?)\s+del\s+lavoro\s+(\S+)\s+di\s+(.+)/i)
  if (markStep) {
    return {
      kind: 'mark_work_step_done',
      stepTitle: cleanName(markStep[1]),
      workHint: markStep[2],
      clientName: cleanName(markStep[3]),
    }
  }

  return null
}
