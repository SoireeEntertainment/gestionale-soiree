/**
 * Read-only: query sui lavori + testo per chat e patch contesto thread.
 */

import { prisma } from '@/lib/prisma'
import {
  findWorksByClientCategoryOrTitle,
  resolveSingleClient,
  resolveUserByNameHint,
} from '@/lib/assistant/resolve-entities'
import type { AssistantThreadContext } from '@/lib/assistant/thread-context'
import type { WorkListAssigneeRow, WorkPeriod, WorkProgressDto } from '@/lib/assistant/work-query-layer'
import {
  getClientWorkSummary,
  getUserWorkloadSummary,
  getWorkProgressSummary,
  getWorkSteps,
  searchAllActiveWorksInPeriod,
  searchOverdueWorks,
  searchWorksByCategoryName,
  searchWorksByClient,
  searchWorksByUser,
} from '@/lib/assistant/work-query-layer'

export type ReadWorkResult = {
  text: string
  threadContextUpdate?: Partial<AssistantThreadContext>
  readQuickLinks?: { label: string; href: string }[]
}

const STATUS_IT: Record<string, string> = {
  TODO: 'Da fare',
  IN_PROGRESS: 'In corso',
  IN_REVIEW: 'In revisione',
  WAITING_CLIENT: 'In attesa cliente',
  DONE: 'Completato',
  PAUSED: 'In pausa',
  CANCELED: 'Annullato',
  BLOCKED: 'Bloccato',
}

const PRIORITY_IT: Record<string, string> = {
  LOW: 'bassa',
  MEDIUM: 'media',
  HIGH: 'alta',
}

function statusIt(s: string): string {
  return STATUS_IT[s] ?? s.replace(/_/g, ' ').toLowerCase()
}

function fmtDl(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—'
}

function linksFromWorks(works: WorkListAssigneeRow[], max = 5): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  const seen = new Set<string>()
  for (const w of works) {
    if (out.length >= max) break
    if (seen.has(w.id)) continue
    seen.add(w.id)
    out.push({ label: `Apri: ${w.title}`, href: `/works/${w.id}` })
  }
  return out
}

function linksFromClient(clientId: string, name: string): { label: string; href: string }[] {
  return [{ label: `Apri cliente ${name}`, href: `/clients/${clientId}` }]
}

function formatWorkLines(works: WorkListAssigneeRow[], intro: string): string {
  if (works.length === 0) {
    return `${intro}\n\nNessun risultato.`
  }
  const lines = works.map((w, i) => {
    const dl = fmtDl(w.deadline)
    const pct = w.stepPct != null ? ` · ${w.stepPct}% step` : ''
    const assign = w.assigneeNames.length ? ` · ${w.assigneeNames.join(', ')}` : ''
    const pr = w.priority ? ` · priorità ${PRIORITY_IT[w.priority] ?? w.priority}` : ''
    return `${i + 1}. **${w.title}** — ${w.clientName} (${w.categoryName}) · ${statusIt(w.status)}${pr} · scadenza ${dl}${assign}${pct}`
  })
  return `${intro}\n\n${lines.join('\n')}`
}

async function resolveSelfOrUser(
  nameHint: string | undefined,
  currentUserId: string,
  currentUserName: string
): Promise<{ ok: true; id: string; name: string } | { ok: false; text: string }> {
  const t = nameHint?.trim().toLowerCase() ?? ''
  if (!nameHint?.trim() || t === 'io' || t === 'me' || t === 'mio' || t === 'me stesso') {
    return { ok: true, id: currentUserId, name: currentUserName }
  }
  const r = await resolveUserByNameHint(nameHint.trim())
  if (!r) {
    return { ok: false, text: `Non ho trovato un utente simile a "${nameHint}".` }
  }
  if ('ambiguous' in r) {
    return {
      ok: false,
      text: `Più utenti compatibili: ${r.ambiguous.map((u) => u.name).join(', ')}. Specifica meglio.`,
    }
  }
  return { ok: true, id: r.id, name: r.name }
}

export async function readQueryUserWorks(params: {
  userNameHint?: string
  period?: WorkPeriod
  overdueOnly?: boolean
  currentUserId: string
  currentUserName: string
}): Promise<ReadWorkResult> {
  const ru = await resolveSelfOrUser(params.userNameHint, params.currentUserId, params.currentUserName)
  if (!ru.ok) return { text: ru.text }

  const period = params.period ?? 'all'
  const works = await searchWorksByUser(ru.id, {
    overdueOnly: params.overdueOnly === true,
    period: period !== 'all' ? period : undefined,
    includeUndatedWithPeriod: period !== 'all',
    activeOnly: params.overdueOnly !== true,
  })

  const intro =
    params.overdueOnly === true
      ? `Tra i lavori di **${ru.name}**, quelli in ritardo (deadline passata, non completati):`
      : period === 'all'
        ? `Lavori per **${ru.name}** (${works.length}):`
        : `Lavori per **${ru.name}** nel periodo indicato (${works.length}):`

  return {
    text: formatWorkLines(works, intro),
    threadContextUpdate: {
      lastResolvedUserId: ru.id,
      lastResolvedUserName: ru.name,
      lastReadIntentType: 'query_user_works',
    },
    readQuickLinks: linksFromWorks(works),
  }
}

export async function readQueryClientWorks(params: {
  clientNameHint: string
  period?: WorkPeriod
  overdueOnly?: boolean
}): Promise<ReadWorkResult> {
  const cr = await resolveSingleClient(params.clientNameHint.trim())
  if (!cr) {
    return { text: `Non ho trovato un cliente simile a "${params.clientNameHint}".` }
  }
  if ('ambiguous' in cr) {
    return {
      text: `Ho trovato più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}. Quale intendi?`,
    }
  }

  const period = params.period ?? 'all'
  const works = await searchWorksByClient(cr.id, {
    overdueOnly: params.overdueOnly === true,
    period: period !== 'all' ? period : undefined,
    includeUndatedWithPeriod: period !== 'all',
    activeOnly: params.overdueOnly !== true,
  })

  const intro =
    params.overdueOnly === true
      ? `Lavori in ritardo per **${cr.name}**:`
      : `Lavori per **${cr.name}** (${works.length}):`

  return {
    text: formatWorkLines(works, intro),
    threadContextUpdate: {
      lastResolvedClientId: cr.id,
      lastResolvedClientName: cr.name,
      lastReadIntentType: 'query_client_works',
      lastClient: { id: cr.id, name: cr.name },
    },
    readQuickLinks: [...linksFromClient(cr.id, cr.name), ...linksFromWorks(works)],
  }
}

export async function readQueryOverdueWorks(params: { userId?: string; userNameForLabel?: string }): Promise<ReadWorkResult> {
  const works = await searchOverdueWorks(params.userId ? { userId: params.userId } : undefined)
  const intro = params.userId
    ? `Lavori in ritardo per **${params.userNameForLabel ?? 'l’utente'}** (${works.length}):`
    : `Lavori in ritardo nel gestionale (${works.length}, ordinati per deadline):`

  return {
    text: formatWorkLines(works, intro),
    threadContextUpdate: {
      lastReadIntentType: params.userId ? 'query_user_overdue' : 'query_overdue_works',
      ...(params.userId && params.userNameForLabel
        ? { lastResolvedUserId: params.userId, lastResolvedUserName: params.userNameForLabel }
        : {}),
    },
    readQuickLinks: linksFromWorks(works),
  }
}

function formatProgressBlock(p: WorkProgressDto): string {
  const dl = fmtDl(p.deadline)
  const pct = p.stepPct != null ? `${p.stepPct}%` : 'n/d'
  const lines = p.steps.map((s) => `- ${s.title} — ${s.status === 'DONE' ? 'completato' : 'da fare'}`)
  return [
    `**${p.title}** (${p.clientName}, ${p.categoryName})`,
    `- Stato: ${statusIt(p.status)}`,
    `- Deadline: ${dl}`,
    `- Avanzamento step: **${p.stepsDone}/${p.stepsTotal}** (${pct})`,
    '',
    'Step:',
    ...lines,
  ].join('\n')
}

export async function readQueryWorkSteps(params: {
  clientName: string
  workTitleHint: string
  mode: 'missing' | 'full'
}): Promise<ReadWorkResult> {
  const cr = await resolveSingleClient(params.clientName.trim())
  if (!cr || 'ambiguous' in cr) {
    return {
      text: cr && 'ambiguous' in cr
        ? `Più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}.`
        : `Cliente non trovato.`,
    }
  }
  const works = await findWorksByClientCategoryOrTitle(cr.id, params.workTitleHint)
  if (works.length === 0) {
    return { text: `Nessun lavoro corrispondente a "${params.workTitleHint}" per **${cr.name}**.` }
  }
  if (works.length > 1) {
    return {
      text: `Ho trovato ${works.length} lavori compatibili (${works.map((w) => w.title).join(', ')}). Quale intendi?`,
    }
  }

  const workId = works[0].id
  const steps = await getWorkSteps(workId)
  const todo = steps.filter((s) => s.status !== 'DONE')
  const done = steps.length - todo.length

  if (params.mode === 'missing') {
    if (steps.length === 0) {
      return {
        text: `Il lavoro **${works[0].title}** di **${cr.name}** non ha step definiti.`,
        threadContextUpdate: {
          lastResolvedWorkId: workId,
          lastReadIntentType: 'query_work_steps',
          lastWork: { id: workId, title: works[0].title, clientId: cr.id, clientName: cr.name },
        },
        readQuickLinks: [{ label: 'Apri lavoro', href: `/works/${workId}` }],
      }
    }
    const lines = todo.map((s) => `- ${s.title}`)
    return {
      text:
        todo.length === 0
          ? `Tutti gli step del lavoro **${works[0].title}** di **${cr.name}** risultano completati (${done}/${steps.length}).`
          : `Nel lavoro **${works[0].title}** di **${cr.name}** mancano **${todo.length}** step su **${steps.length}**:\n${lines.join('\n')}`,
      threadContextUpdate: {
        lastResolvedWorkId: workId,
        lastReadIntentType: 'query_work_steps',
        lastWork: { id: workId, title: works[0].title, clientId: cr.id, clientName: cr.name },
      },
      readQuickLinks: [
        { label: 'Apri lavoro', href: `/works/${workId}` },
        { label: 'Apri cliente', href: `/clients/${cr.id}` },
      ],
    }
  }

  const full = await getWorkProgressSummary(workId)
  if (!full) return { text: 'Lavoro non trovato.' }
  return {
    text: `Processo — **${full.title}** (${cr.name}):\n\n${formatProgressBlock(full)}`,
    threadContextUpdate: {
      lastResolvedWorkId: workId,
      lastReadIntentType: 'query_work_steps',
      lastWork: { id: workId, title: full.title, clientId: cr.id, clientName: cr.name },
    },
    readQuickLinks: [
      { label: 'Apri lavoro', href: `/works/${workId}` },
      { label: 'Apri cliente', href: `/clients/${cr.id}` },
    ],
  }
}

export async function readQueryWorkProgressPoint(params: {
  clientName: string
  workTitleHint: string
}): Promise<ReadWorkResult> {
  const cr = await resolveSingleClient(params.clientName.trim())
  if (!cr || 'ambiguous' in cr) {
    return {
      text: cr && 'ambiguous' in cr ? `Più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}.` : `Cliente non trovato.`,
    }
  }
  const works = await findWorksByClientCategoryOrTitle(cr.id, params.workTitleHint)
  if (works.length !== 1) {
    return {
      text:
        works.length === 0
          ? `Nessun lavoro "${params.workTitleHint}" per **${cr.name}**.`
          : `Ho trovato ${works.length} lavori compatibili (${works.map((w) => w.title).join(', ')}). Quale intendi?`,
    }
  }
  const p = await getWorkProgressSummary(works[0].id)
  if (!p) return { text: 'Lavoro non trovato.' }
  const dl = fmtDl(p.deadline)
  const pct = p.stepPct ?? 0
  const text = [
    `Il lavoro **${p.title}** di **${p.clientName}** è al **${pct}%**: `,
    `${p.stepsDone} step completati su ${p.stepsTotal}, stato **${statusIt(p.status)}**, deadline **${dl}**.`,
  ].join('')
  return {
    text,
    threadContextUpdate: {
      lastResolvedWorkId: p.workId,
      lastReadIntentType: 'query_work_progress',
      lastWork: { id: p.workId, title: p.title, clientId: cr.id, clientName: cr.name },
    },
    readQuickLinks: [
      { label: 'Apri lavoro', href: `/works/${p.workId}` },
      { label: 'Mostra dettagli', href: `/works/${p.workId}` },
    ],
  }
}

export async function readQueryWorkProgressByWorkId(workId: string): Promise<ReadWorkResult> {
  const p = await getWorkProgressSummary(workId)
  if (!p) return { text: 'Lavoro non trovato.' }
  const w = await prisma.work.findUnique({
    where: { id: workId },
    select: { clientId: true },
  })
  const dl = fmtDl(p.deadline)
  const pct = p.stepPct ?? 0
  const text = `Il lavoro **${p.title}** di **${p.clientName}** è al **${pct}%**: ${p.stepsDone}/${p.stepsTotal} step, stato **${statusIt(p.status)}**, deadline **${dl}**.`
  return {
    text,
    threadContextUpdate: {
      lastResolvedWorkId: workId,
      lastReadIntentType: 'query_work_progress',
      lastWork: {
        id: workId,
        title: p.title,
        clientId: w?.clientId ?? '',
        clientName: p.clientName,
      },
    },
    readQuickLinks: [{ label: 'Apri lavoro', href: `/works/${workId}` }],
  }
}

export async function readQueryWorkload(params: {
  periodLabel: string
  scope?: 'week' | 'month'
}): Promise<ReadWorkResult> {
  const rows = await getUserWorkloadSummary(params.scope === 'month' ? 'month' : 'week')
  const withWork = rows.filter((r) => r.assignedActive > 0)
  if (withWork.length === 0) {
    return {
      text: 'Nessun utente con lavori attivi assegnati al momento.',
      threadContextUpdate: { lastReadIntentType: 'query_workload' },
    }
  }
  const top = withWork.slice(0, 12)
  const lines = top.map((r, i) => {
    const od = r.overdue > 0 ? ` · in ritardo: ${r.overdue}` : ''
    return `${i + 1}. **${r.userName}**: ${r.assignedActive} lavori attivi${od} (completati nel periodo: ${r.doneInPeriod})`
  })
  return {
    text: `Carico ${params.periodLabel} (per numero di lavori attivi assegnati):\n\n${lines.join('\n')}`,
    threadContextUpdate: { lastReadIntentType: 'query_workload' },
  }
}

export async function readQueryWorkSummary(params: {
  clientName?: string
  categoryHint?: string
  period?: WorkPeriod
}): Promise<ReadWorkResult> {
  if (params.clientName?.trim()) {
    const cr = await resolveSingleClient(params.clientName.trim())
    if (!cr || 'ambiguous' in cr) {
      return {
        text: cr && 'ambiguous' in cr ? `Più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}.` : `Cliente non trovato.`,
      }
    }
    const works = await getClientWorkSummary(cr.id)
    const lines = works.slice(0, 25).map((w, i) => {
      const dl = fmtDl(w.deadline)
      const pct = w.stepPct != null ? ` · ${w.stepPct}%` : ''
      return `${i + 1}. **${w.title}** · ${statusIt(w.status)} · ${dl}${pct}`
    })
    return {
      text: `Riepilogo lavori attivi per **${cr.name}** (${works.length}):\n\n${lines.join('\n') || 'Nessun lavoro attivo.'}`,
      threadContextUpdate: {
        lastResolvedClientId: cr.id,
        lastResolvedClientName: cr.name,
        lastReadIntentType: 'query_work_summary',
        lastClient: { id: cr.id, name: cr.name },
      },
      readQuickLinks: [...linksFromClient(cr.id, cr.name), ...linksFromWorks(works)],
    }
  }

  if (params.categoryHint?.trim()) {
    const works = await searchWorksByCategoryName(params.categoryHint.trim(), { activeOnly: true })
    if (works.length === 0) {
      return { text: `Nessun lavoro attivo in una categoria simile a "${params.categoryHint}".` }
    }
    return {
      text: formatWorkLines(works, `Panoramica lavori attivi — categoria **${params.categoryHint}**:`),
      threadContextUpdate: {
        lastCategoryHint: params.categoryHint.trim(),
        lastReadIntentType: 'query_work_summary',
      },
      readQuickLinks: linksFromWorks(works),
    }
  }

  if (params.period && params.period !== 'all') {
    const works = await searchAllActiveWorksInPeriod(params.period, true)
    const label =
      params.period === 'week'
        ? 'questa settimana'
        : params.period === 'today'
          ? 'oggi'
          : params.period === 'month'
            ? 'questo mese'
            : 'nei prossimi 7 giorni'
    return {
      text: formatWorkLines(works, `Riepilogo lavori attivi ${label} (deadline nel periodo o senza scadenza):`),
      threadContextUpdate: { lastReadIntentType: 'query_work_summary' },
      readQuickLinks: linksFromWorks(works),
    }
  }

  return {
    text: 'Indica un cliente, una categoria (es. Website) o un periodo (es. questa settimana) per il riepilogo.',
  }
}

/** Risolve "lavori ha X" provando utente poi cliente. */
export async function readQueryWorksForNamedEntity(params: {
  name: string
  period?: WorkPeriod
  overdueOnly?: boolean
  currentUserId: string
  currentUserName: string
}): Promise<ReadWorkResult> {
  const name = params.name.trim()
  const userRes = await resolveUserByNameHint(name)
  const clientRes = await resolveSingleClient(name)

  const userOk = userRes && !('ambiguous' in userRes)
  const clientOk = clientRes && !('ambiguous' in clientRes)
  const userAmb = userRes && 'ambiguous' in userRes
  const clientAmb = clientRes && 'ambiguous' in clientRes

  if (userAmb && clientAmb) {
    return {
      text: 'Il nome è ambiguo sia come utente sia come cliente. Specifica meglio (es. «lavori assegnati a Davide» o «lavori per cliente Rinlux»).',
    }
  }
  if (userAmb) {
    return {
      text: `Più utenti per "${name}": ${userRes.ambiguous.map((u) => u.name).join(', ')}.`,
    }
  }
  if (clientAmb) {
    return {
      text: `Più clienti per "${name}": ${clientRes.ambiguous.map((c) => c.name).join(', ')}.`,
    }
  }

  if (userOk && !clientOk) {
    return readQueryUserWorks({
      userNameHint: name,
      period: params.period,
      overdueOnly: params.overdueOnly,
      currentUserId: params.currentUserId,
      currentUserName: params.currentUserName,
    })
  }
  if (clientOk && !userOk) {
    return readQueryClientWorks({
      clientNameHint: name,
      period: params.period,
      overdueOnly: params.overdueOnly,
    })
  }
  if (userOk && clientOk) {
    return {
      text: `Ho trovato sia un utente sia un cliente chiamati simile a "${name}". Di cosa hai bisogno: **lavori assegnati** a quell’utente o **lavori del cliente**?`,
    }
  }

  return { text: `Non ho trovato utenti o clienti simili a "${name}".` }
}
