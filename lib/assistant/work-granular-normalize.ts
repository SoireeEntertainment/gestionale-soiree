import { prisma } from '@/lib/prisma'
import type { AssistantThreadContext } from '@/lib/assistant/thread-context'
import { findCategoryByNameHint } from '@/lib/assistant/resolve-entities'
import {
  parseItalianoNameList,
  resolveUserIdsFromLabelList,
  resolveWorkFromAssistantParams,
  resolveStepOnWork,
} from '@/lib/assistant/work-resolve'
import { parseDeadlineFlexible } from '@/lib/assistant/parse-it-date'

function normDeadline(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return parseDeadlineFlexible(t)
}

type NormResult =
  | { ok: true; actionType: string; payload: Record<string, unknown> }
  | { ok: false; reply: string }

const GRANULAR = new Set([
  'update_work_title',
  'update_work_description',
  'update_work_category',
  'update_work_status',
  'update_work_priority',
  'update_work_deadline',
  'assign_work_users',
  'unassign_work_users',
  'add_work_note',
  'delete_work_step',
  'reorder_work_steps',
  'mark_work_step_done',
  'mark_work_step_todo',
])

function str(params: Record<string, unknown>, k: string) {
  return typeof params[k] === 'string' ? (params[k] as string).trim() : ''
}

function mapPriorityIt(s: string): 'LOW' | 'MEDIUM' | 'HIGH' | null {
  const x = s.toLowerCase()
  if (/^high$|^alta$|urgent|urgente/i.test(x)) return 'HIGH'
  if (/^medium$|^media$|normale/i.test(x)) return 'MEDIUM'
  if (/^low$|^bassa$/i.test(x)) return 'LOW'
  return null
}

function mapStatusIt(s: string): string | null {
  const x = s.toUpperCase().replace(/\s+/g, '_')
  const allowed = [
    'TODO',
    'IN_PROGRESS',
    'IN_REVIEW',
    'WAITING_CLIENT',
    'DONE',
    'PAUSED',
    'CANCELED',
  ] as const
  if (allowed.includes(x as (typeof allowed)[number])) return x
  const map: Record<string, string> = {
    'DA_FARE': 'TODO',
    'IN_CORSO': 'IN_PROGRESS',
    'IN_REVISIONE': 'IN_REVIEW',
    'IN_ATTESA_CLIENTE': 'WAITING_CLIENT',
    'COMPLETATO': 'DONE',
    'IN_PAUSA': 'PAUSED',
    'ANNULLATO': 'CANCELED',
  }
  const k = s.toLowerCase()
  if (/completat|done|fatto/i.test(k)) return 'DONE'
  if (/progress|corso/i.test(k)) return 'IN_PROGRESS'
  if (/review|revisione/i.test(k)) return 'IN_REVIEW'
  if (/attesa.*cliente|waiting/i.test(k)) return 'WAITING_CLIENT'
  if (/pausa|paused/i.test(k)) return 'PAUSED'
  if (/annull|cancell/i.test(k)) return 'CANCELED'
  if (/da fare|todo|aperto/i.test(k)) return 'TODO'
  return map[x] ?? null
}

async function mapStepTitlesToIds(
  workId: string,
  orderedTitles: string[]
): Promise<{ ok: true; ids: string[] } | { ok: false; reply: string }> {
  const steps = await prisma.workStep.findMany({
    where: { workId },
    orderBy: { sortOrder: 'asc' },
  })
  if (steps.length === 0) return { ok: false, reply: 'Questo lavoro non ha step.' }
  const used = new Set<string>()
  const ids: string[] = []
  for (const t of orderedTitles) {
    const ttrim = t.trim()
    if (!ttrim) continue
    const hits = steps.filter(
      (s) =>
        !used.has(s.id) &&
        (s.title.toLowerCase() === ttrim.toLowerCase() ||
          s.title.toLowerCase().includes(ttrim.toLowerCase()))
    )
    if (hits.length !== 1) {
      return {
        ok: false,
        reply:
          hits.length === 0
            ? `Nessuno step trovato per "${ttrim}" nel riordino.`
            : `Più step per "${ttrim}": ${hits.map((h) => h.title).join(', ')}.`,
      }
    }
    ids.push(hits[0].id)
    used.add(hits[0].id)
  }
  if (ids.length !== steps.length) {
    return {
      ok: false,
      reply: `Per riordinare servono tutti gli step del lavoro (${steps.length} totali). Ne hai indicati ${ids.length}.`,
    }
  }
  return { ok: true, ids }
}

export async function tryNormalizeGranularWorkIntent(
  type: string,
  params: Record<string, unknown>,
  threadCtx: AssistantThreadContext | null
): Promise<NormResult | null> {
  if (!GRANULAR.has(type)) return null

  const implicit = str(params, 'useImplicitLastWork') === 'true' || str(params, 'implicitWork') === 'true'
  const rw = await resolveWorkFromAssistantParams(params, threadCtx, { implicitLastWork: implicit })
  if (!rw.ok) return rw

  const workId = rw.work.id

  switch (type) {
    case 'update_work_title': {
      const title = str(params, 'title') || str(params, 'newTitle')
      if (!title) return { ok: false, reply: 'Che titolo vuoi impostare per il lavoro?' }
      return { ok: true, actionType: type, payload: { workId, title } }
    }
    case 'update_work_description': {
      const description = str(params, 'description') || str(params, 'newDescription')
      if (!description) return { ok: false, reply: 'Che descrizione vuoi impostare?' }
      return { ok: true, actionType: type, payload: { workId, description } }
    }
    case 'update_work_category': {
      const catHint = str(params, 'categoryName') || str(params, 'category')
      if (!catHint) return { ok: false, reply: 'Indica la nuova categoria (es. Website, Social).' }
      const cat = await findCategoryByNameHint(catHint)
      if (!cat) return { ok: false, reply: `Categoria non trovata per "${catHint}".` }
      return { ok: true, actionType: type, payload: { workId, categoryId: cat.id } }
    }
    case 'update_work_status': {
      const statusRaw = str(params, 'status')
      if (!statusRaw) return { ok: false, reply: 'Che stato vuoi impostare?' }
      const status = mapStatusIt(statusRaw)
      if (!status) return { ok: false, reply: `Stato non riconosciuto: "${statusRaw}".` }
      return { ok: true, actionType: type, payload: { workId, status } }
    }
    case 'update_work_priority': {
      const pr = str(params, 'priority')
      if (!pr) return { ok: false, reply: 'Che priorità (bassa, media, alta)?' }
      const priority = mapPriorityIt(pr)
      if (!priority) return { ok: false, reply: `Priorità non riconosciuta: "${pr}".` }
      return { ok: true, actionType: type, payload: { workId, priority } }
    }
    case 'update_work_deadline': {
      const raw = str(params, 'deadline') || str(params, 'date')
      if (!raw) return { ok: false, reply: 'Che deadline vuoi impostare?' }
      const deadline = normDeadline(raw)
      if (!deadline) return { ok: false, reply: `Data non valida: "${raw}".` }
      return { ok: true, actionType: type, payload: { workId, deadline } }
    }
    case 'assign_work_users': {
      const names = str(params, 'assigneeNames') || str(params, 'userNames') || str(params, 'users')
      if (!names) return { ok: false, reply: 'Chi vuoi assegnare? (nomi separati da virgola o "e")' }
      const ru = await resolveUserIdsFromLabelList(names)
      if (!ru.ok) return { ok: false, reply: ru.reply }
      return { ok: true, actionType: type, payload: { workId, userIds: ru.ids } }
    }
    case 'unassign_work_users': {
      const names = str(params, 'assigneeNames') || str(params, 'userNames') || str(params, 'users')
      if (!names) return { ok: false, reply: 'Chi vuoi rimuovere dall’assegnazione?' }
      const ru = await resolveUserIdsFromLabelList(names)
      if (!ru.ok) return { ok: false, reply: ru.reply }
      return { ok: true, actionType: type, payload: { workId, userIds: ru.ids } }
    }
    case 'add_work_note': {
      const body = str(params, 'note') || str(params, 'body') || str(params, 'text')
      if (!body) return { ok: false, reply: 'Che nota vuoi aggiungere al lavoro?' }
      return { ok: true, actionType: type, payload: { workId, body } }
    }
    case 'delete_work_step': {
      const stepHint = str(params, 'stepTitle') || str(params, 'step') || str(params, 'title')
      if (!stepHint) return { ok: false, reply: 'Quale step vuoi eliminare?' }
      const rs = await resolveStepOnWork(workId, stepHint)
      if (!rs.ok) return { ok: false, reply: rs.reply }
      return { ok: true, actionType: type, payload: { stepId: rs.step.id, workId } }
    }
    case 'reorder_work_steps': {
      let titles: string[] = []
      if (Array.isArray(params.stepTitlesInOrder)) {
        titles = (params.stepTitlesInOrder as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      } else {
        const raw = str(params, 'stepTitlesInOrder') || str(params, 'order')
        titles = parseItalianoNameList(raw.replace(/\s*,\s*/g, ','))
      }
      if (titles.length < 2) return { ok: false, reply: 'Indica l’ordine desiderato degli step (es. Analisi, Wireframe, Design).' }
      const mapped = await mapStepTitlesToIds(workId, titles)
      if (!mapped.ok) return { ok: false, reply: mapped.reply }
      return { ok: true, actionType: type, payload: { workId, orderedStepIds: mapped.ids } }
    }
    case 'mark_work_step_done':
    case 'mark_work_step_todo': {
      const stepHint = str(params, 'stepTitle') || str(params, 'step') || str(params, 'title')
      if (!stepHint) return { ok: false, reply: 'Quale step?' }
      const rs = await resolveStepOnWork(workId, stepHint)
      if (!rs.ok) return { ok: false, reply: rs.reply }
      return {
        ok: true,
        actionType: type,
        payload: { stepId: rs.step.id, workId, markDone: type === 'mark_work_step_done' },
      }
    }
    default:
      return null
  }
}
