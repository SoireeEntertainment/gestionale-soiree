import { z } from 'zod'
import { getWorks, createWork } from '@/app/actions/works'
import {
  moveWorkStatusOnBoard,
  reactivateWork,
  reassignWorkOnBoard,
  rescheduleWorkDeadline,
} from '@/app/actions/works-board'
import { formatDateItFromYmd, todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import {
  MAX_ITEMS,
  defineTool,
  queueWrite,
  requireAdmin,
  resolveCategory,
  resolveClient,
  resolveDate,
  resolveUser,
  resolveUserOrSelf,
  resolveWork,
  workStatusLabel,
} from '@/lib/assistant-v2/tools/helpers'
import { prisma } from '@/lib/prisma'
import {
  dbDateToDateOnly,
  diffCalendarDaysLocal,
  parseDateOnly,
} from '@/lib/timeline-dates'
import { getWorkDueDateHistory } from '@/lib/work-due-date-history'
import { computeIsOverdue } from '@/lib/works-board'

const WORK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'DONE', 'PAUSED', 'CANCELED'] as const
const WORK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
const CLOSED = new Set<string>(['DONE', 'CANCELED'])

type WorkRow = Awaited<ReturnType<typeof getWorks>>[number]

function serializeWork(w: WorkRow, today: string) {
  const deadline = w.deadline ? dbDateToDateOnly(w.deadline) : null
  return {
    id: w.id,
    title: w.title,
    status: w.status,
    statusLabel: workStatusLabel(w.status),
    priority: w.priority,
    deadline,
    isOverdue: computeIsOverdue(deadline, w.status, today),
    clientName: w.client.name,
    categoryName: w.category.name,
    assignedTo: w.assignedTo?.name ?? null,
  }
}

const READ_BASE = {
  kind: 'read' as const,
  risk: 'low' as const,
  requiresConfirmation: false,
  permission: 'works_read' as const,
}

const WRITE_BASE = {
  kind: 'write' as const,
  risk: 'medium' as const,
  requiresConfirmation: true,
  permission: 'works_write' as const,
}

/* ------------------------------- LETTURE --------------------------------- */

const listActiveWorks = defineTool({
  ...READ_BASE,
  name: 'list_active_works',
  description:
    'Elenca i lavori attivi (non completati né annullati) ordinati per scadenza. Filtri opzionali: cliente, stato, assegnatario, in scadenza entro 7 giorni.',
  inputSchema: z.object({
    clientName: z.string().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED']).optional(),
    assigneeName: z.string().optional(),
    dueSoon: z.boolean().optional().describe('true = solo in scadenza entro 7 giorni'),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied

    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }
    let assignedUserId: string | undefined
    if (input.assigneeName?.trim()) {
      const u = await resolveUser(input.assigneeName)
      if (u.ok === false) return u
      assignedUserId = u.id
    }

    const rows = await getWorks({
      clientId,
      status: input.status,
      assignedUserId,
      deadlineFilter: input.dueSoon ? 'IN_SCADENZA_7_GIORNI' : undefined,
    })
    const today = todayDateOnlyRome()
    const active = rows.filter((w) => !CLOSED.has(w.status))
    const works = active.slice(0, MAX_ITEMS).map((w) => serializeWork(w, today))

    return {
      ok: true,
      summary:
        active.length === 0
          ? 'Nessun lavoro attivo con questi filtri.'
          : `${active.length} lavori attivi${active.length > works.length ? ` (mostro i primi ${works.length})` : ''}.`,
      data: { total: active.length, works },
      href: '/works',
      entityType: 'Work',
      quickLinks: [{ label: 'Apri Lavori', href: '/works' }],
    }
  },
})

const listWorksForUser = defineTool({
  ...READ_BASE,
  name: 'list_works_for_user',
  description:
    'Elenca i lavori assegnati a una persona (primaria o co-assegnata). Se non indicata, l’utente corrente.',
  inputSchema: z.object({
    userName: z.string().optional().describe('Nome della persona; vuoto = utente corrente'),
    bucket: z.enum(['active', 'done']).default('active'),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied
    const user = await resolveUserOrSelf(ctx, input.userName)
    if (user.ok === false) return user

    const rows = await getWorks({
      assignedUserId: user.id,
      status: input.bucket === 'done' ? 'DONE' : undefined,
    })
    const today = todayDateOnlyRome()
    const filtered = input.bucket === 'done' ? rows : rows.filter((w) => !CLOSED.has(w.status))
    const works = filtered.slice(0, MAX_ITEMS).map((w) => serializeWork(w, today))
    const overdue = works.filter((w) => w.isOverdue).length

    return {
      ok: true,
      summary:
        filtered.length === 0
          ? `Nessun lavoro ${input.bucket === 'done' ? 'completato' : 'attivo'} per ${user.name}.`
          : `${user.name}: ${filtered.length} lavori ${input.bucket === 'done' ? 'completati' : 'attivi'}${overdue ? `, ${overdue} scaduti` : ''}.`,
      data: { user: { id: user.id, name: user.name }, total: filtered.length, overdue, works },
      href: `/works/person/${user.id}`,
      entityType: 'Work',
      quickLinks: [{ label: `Lavori di ${user.name}`, href: `/works/person/${user.id}` }],
    }
  },
})

const listOverdueWorks = defineTool({
  ...READ_BASE,
  name: 'list_overdue_works',
  description: 'Elenca i lavori scaduti (scadenza passata, non completati), dal più in ritardo.',
  inputSchema: z.object({
    clientName: z.string().optional(),
    assigneeName: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied

    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }
    let assignedUserId: string | undefined
    if (input.assigneeName?.trim()) {
      const u = await resolveUser(input.assigneeName)
      if (u.ok === false) return u
      assignedUserId = u.id
    }

    const rows = await getWorks({ clientId, assignedUserId, deadlineFilter: 'SCADUTI' })
    const today = todayDateOnlyRome()
    const overdue = rows
      .map((w) => serializeWork(w, today))
      .filter((w) => w.isOverdue)
      .map((w) => ({
        ...w,
        daysLate: w.deadline ? diffCalendarDaysLocal(parseDateOnly(w.deadline), parseDateOnly(today)) : null,
      }))
      .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0))

    return {
      ok: true,
      summary:
        overdue.length === 0
          ? 'Nessun lavoro scaduto.'
          : `${overdue.length} lavori scaduti${overdue.length > MAX_ITEMS ? ` (mostro i primi ${MAX_ITEMS})` : ''}.`,
      data: { total: overdue.length, works: overdue.slice(0, MAX_ITEMS) },
      href: '/works',
      entityType: 'Work',
      quickLinks: [{ label: 'Apri Lavori', href: '/works' }],
    }
  },
})

const getWorkDueHistory = defineTool({
  ...READ_BASE,
  name: 'get_work_due_history',
  description: 'Storico delle scadenze di un lavoro: data originale e tutte le riprogrammazioni (chi, quando, nota).',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro'),
    clientName: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied
    const found = await resolveWork(ctx, { ...input, scope: 'any' })
    if (found.ok === false) return found
    const { work } = found

    const history = await getWorkDueDateHistory(work.id)
    const fmt = (d: Date | null) => (d ? formatDateItFromYmd(dbDateToDateOnly(d)) : 'nessuna');
    const entries = history.map((h) => ({
      isOriginal: h.isOriginal,
      previousDeadline: h.previousDeadline ? dbDateToDateOnly(h.previousDeadline) : null,
      newDeadline: h.newDeadline ? dbDateToDateOnly(h.newDeadline) : null,
      changedAt: h.changedAt.toISOString(),
      changedBy: h.changedBy.name,
      note: h.note,
      label: h.isOriginal ? `Scadenza originale: ${fmt(h.newDeadline)}` : `${fmt(h.previousDeadline)} → ${fmt(h.newDeadline)}`,
    }))
    const reschedules = entries.filter((e) => !e.isOriginal).length

    return {
      ok: true,
      summary:
        entries.length === 0
          ? `Nessuno storico scadenze per «${work.title}».`
          : `«${work.title}» (${work.clientName}): ${reschedules} riprogrammazioni.`,
      data: {
        work: { id: work.id, title: work.title, clientName: work.clientName, currentDeadline: work.deadline },
        reschedules,
        entries,
      },
      href: `/works/${work.id}`,
      entityType: 'Work',
      entityId: work.id,
    }
  },
})

/* ------------------------------- SCRITTURE ------------------------------- */

type CreateWorkPayload = {
  title: string
  description: string
  clientId: string
  categoryId: string
  status: (typeof WORK_STATUSES)[number]
  priority?: (typeof WORK_PRIORITIES)[number]
  startDate: string
  deadline: string
  assignedToUserId: string | null
  assigneeUserIds: string[]
}

const createWorkTool = defineTool({
  ...WRITE_BASE,
  name: 'create_work',
  description:
    'Crea un nuovo lavoro per un cliente (richiede conferma). Serve cliente e categoria; scadenza e assegnatari opzionali. Gli assegnatari ricevono la notifica automatica già prevista dall’app.',
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    clientName: z.string().describe('Nome cliente (mai ID)'),
    categoryName: z.string().describe('Nome categoria, es. Social, Sito web'),
    description: z.string().optional().nullable(),
    status: z.enum(WORK_STATUSES).default('TODO'),
    priority: z.enum(WORK_PRIORITIES).optional(),
    startDatePhrase: z.string().optional().describe('Data di partenza, default oggi'),
    deadlinePhrase: z.string().optional().describe('es. venerdì, 30 novembre'),
    assigneeNames: z.array(z.string()).optional().describe('Il primo è l’assegnatario principale'),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (client.ok === false) return client
    const category = await resolveCategory(input.categoryName)
    if (category.ok === false) return category

    let startDate = ''
    if (input.startDatePhrase?.trim()) {
      const d = resolveDate(input.startDatePhrase)
      if (d.ok === false) return d
      startDate = d.date
    }
    let deadline = ''
    if (input.deadlinePhrase?.trim()) {
      const d = resolveDate(input.deadlinePhrase)
      if (d.ok === false) return d
      deadline = d.date
    }
    if (startDate && deadline && startDate > deadline) {
      return {
        ok: false,
        error: 'La data di partenza deve essere precedente o uguale alla scadenza.',
        clarify: true,
      }
    }

    const assignees: { id: string; name: string }[] = []
    for (const n of input.assigneeNames ?? []) {
      if (!n.trim()) continue
      const u = await resolveUser(n)
      if (u.ok === false) return u
      if (!assignees.some((a) => a.id === u.id)) assignees.push({ id: u.id, name: u.name })
    }

    const duplicate = await prisma.work.findFirst({
      where: {
        clientId: client.id,
        title: { equals: input.title.trim(), mode: 'insensitive' },
        status: { notIn: ['DONE', 'CANCELED'] },
      },
      select: { id: true },
    })

    const payload: CreateWorkPayload = {
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      clientId: client.id,
      categoryId: category.id,
      status: input.status,
      priority: input.priority,
      startDate,
      deadline,
      assignedToUserId: assignees[0]?.id ?? null,
      assigneeUserIds: assignees.map((a) => a.id),
    }

    return queueWrite(ctx, 'create_work', payload, {
      title: 'Crea lavoro',
      summary: `${payload.title} — ${client.name}`,
      fields: [
        { label: 'Titolo', value: payload.title },
        { label: 'Cliente', value: client.name },
        { label: 'Categoria', value: category.name },
        { label: 'Stato', value: workStatusLabel(payload.status) },
        { label: 'Scadenza', value: deadline ? formatDateItFromYmd(deadline) : 'nessuna' },
        { label: 'Assegnato a', value: assignees.length ? assignees.map((a) => a.name).join(', ') : 'nessuno' },
        ...(assignees.length ? [{ label: 'Notifica assegnatari', value: 'sì (automatica dell’app)' }] : []),
        ...(duplicate ? [{ label: 'Attenzione', value: 'Esiste già un lavoro attivo con lo stesso titolo per questo cliente' }] : []),
      ],
      href: '/works',
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: CreateWorkPayload) => {
    const res = await createWork(payload)
    return {
      ok: true,
      summary: `Lavoro creato: «${res.work.title}».`,
      entityType: 'Work',
      entityId: res.work.id,
      href: `/works/${res.work.id}`,
      data: { id: res.work.id, title: res.work.title },
      quickLinks: [{ label: 'Apri lavoro', href: `/works/${res.work.id}` }],
    }
  },
})

type StatusPayload = { workId: string; status: (typeof WORK_STATUSES)[number] }

const updateWorkStatusTool = defineTool({
  ...WRITE_BASE,
  name: 'update_work_status',
  description: 'Cambia lo stato di un lavoro (Da fare, In corso, In revisione, Attesa cliente, In pausa, Annullato, Fatto).',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro'),
    clientName: z.string().optional(),
    status: z.enum(WORK_STATUSES),
  }),
  execute: async (input, ctx) => {
    const found = await resolveWork(ctx, { workQuery: input.workQuery, clientName: input.clientName, scope: 'any' })
    if (found.ok === false) return found
    const { work } = found
    if (work.status === input.status) {
      return { ok: false, error: `«${work.title}» è già in stato ${workStatusLabel(work.status)}.` }
    }
    const payload: StatusPayload = { workId: work.id, status: input.status }
    return queueWrite(ctx, 'update_work_status', payload, {
      title: 'Cambia stato lavoro',
      summary: work.title,
      fields: [
        { label: 'Lavoro', value: work.title },
        { label: 'Cliente', value: work.clientName },
        { label: 'Stato', value: `${workStatusLabel(work.status)} → ${workStatusLabel(input.status)}` },
      ],
      href: `/works/${work.id}`,
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: StatusPayload) => {
    await moveWorkStatusOnBoard(payload)
    return {
      ok: true,
      summary: `Stato aggiornato a ${workStatusLabel(payload.status)}.`,
      entityType: 'Work',
      entityId: payload.workId,
      href: `/works/${payload.workId}`,
    }
  },
})

type ReschedulePayload = { workId: string; deadline: string | null; note: string | null }

const rescheduleWorkDeadlineTool = defineTool({
  ...WRITE_BASE,
  name: 'reschedule_work_deadline',
  description:
    'Sposta la scadenza di un lavoro (registra lo storico scadenze). Usare SEMPRE questo tool per cambiare una scadenza lavoro.',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro'),
    clientName: z.string().optional(),
    newDeadlinePhrase: z.string().optional().describe('es. venerdì, 30 novembre, tra 3 giorni'),
    removeDeadline: z.boolean().optional().describe('true = rimuove la scadenza'),
    note: z.string().max(2000).optional().nullable().describe('Motivo dello spostamento'),
  }),
  execute: async (input, ctx) => {
    const found = await resolveWork(ctx, { workQuery: input.workQuery, clientName: input.clientName, scope: 'active' })
    if (found.ok === false) return found
    const { work } = found

    let deadline: string | null = null
    if (!input.removeDeadline) {
      if (!input.newDeadlinePhrase?.trim()) {
        return { ok: false, error: 'Per quando vuoi spostare la scadenza?', clarify: true }
      }
      const d = resolveDate(input.newDeadlinePhrase)
      if (d.ok === false) return d
      deadline = d.date
    }
    if (deadline === work.deadline) {
      return { ok: false, error: `La scadenza di «${work.title}» è già ${deadline ? formatDateItFromYmd(deadline) : 'assente'}.` }
    }

    const payload: ReschedulePayload = { workId: work.id, deadline, note: input.note?.trim() || null }
    return queueWrite(ctx, 'reschedule_work_deadline', payload, {
      title: 'Sposta scadenza lavoro',
      summary: work.title,
      fields: [
        { label: 'Lavoro', value: work.title },
        { label: 'Cliente', value: work.clientName },
        {
          label: 'Scadenza',
          value: `${work.deadline ? formatDateItFromYmd(work.deadline) : 'nessuna'} → ${deadline ? formatDateItFromYmd(deadline) : 'nessuna'}`,
        },
        ...(payload.note ? [{ label: 'Nota', value: payload.note }] : []),
      ],
      href: `/works/${work.id}`,
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: ReschedulePayload) => {
    const res = await rescheduleWorkDeadline(payload)
    return {
      ok: true,
      summary: res.changed
        ? `Scadenza aggiornata${res.deadline ? ` al ${formatDateItFromYmd(res.deadline)}` : ' (rimossa)'}.`
        : 'La scadenza era già quella indicata, nessuna modifica.',
      entityType: 'Work',
      entityId: payload.workId,
      href: `/works/${payload.workId}`,
    }
  },
})

type ReassignPayload = { workId: string; fromUserId: string; toUserId: string }

const reassignWorkTool = defineTool({
  ...WRITE_BASE,
  name: 'reassign_work',
  description:
    'Riassegna un lavoro da una persona a un’altra (gli altri assegnatari restano). Se "fromUserName" manca usa l’assegnatario attuale (se unico).',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro'),
    clientName: z.string().optional(),
    fromUserName: z.string().optional().describe('Chi lo ha ora'),
    toUserName: z.string().describe('Chi deve prenderlo in carico'),
  }),
  execute: async (input, ctx) => {
    const found = await resolveWork(ctx, { workQuery: input.workQuery, clientName: input.clientName, scope: 'active' })
    if (found.ok === false) return found
    const { work } = found

    const to = await resolveUser(input.toUserName)
    if (to.ok === false) return to

    let from: { id: string; name: string } | null = null
    if (input.fromUserName?.trim()) {
      const f = await resolveUser(input.fromUserName)
      if (f.ok === false) return f
      from = { id: f.id, name: f.name }
      if (!work.assignees.some((a) => a.id === from!.id)) {
        return { ok: false, error: `«${work.title}» non è assegnato a ${from.name}.`, clarify: true }
      }
    } else if (work.assignees.length === 1) {
      from = work.assignees[0]
    } else if (work.assignees.length === 0) {
      return {
        ok: false,
        error: `«${work.title}» non ha assegnatari: la riassegnazione dalla bacheca richiede una persona di partenza. Modifica gli assegnatari dalla scheda lavoro.`,
        href: `/works/${work.id}`,
      }
    } else {
      return {
        ok: false,
        error: `«${work.title}» ha più assegnatari. Da chi vuoi toglierlo?`,
        clarify: true,
        choices: work.assignees.map((a) => ({ id: a.id, label: a.name })),
      }
    }

    if (from.id === to.id) {
      return { ok: false, error: `«${work.title}» è già assegnato a ${to.name}.` }
    }

    const payload: ReassignPayload = { workId: work.id, fromUserId: from.id, toUserId: to.id }
    return queueWrite(ctx, 'reassign_work', payload, {
      title: 'Riassegna lavoro',
      summary: work.title,
      fields: [
        { label: 'Lavoro', value: work.title },
        { label: 'Cliente', value: work.clientName },
        { label: 'Da', value: from.name },
        { label: 'A', value: to.name },
        { label: 'Notifica nuovo assegnatario', value: 'sì (automatica dell’app)' },
      ],
      href: `/works/${work.id}`,
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: ReassignPayload) => {
    await reassignWorkOnBoard(payload)
    return {
      ok: true,
      summary: 'Lavoro riassegnato.',
      entityType: 'Work',
      entityId: payload.workId,
      href: `/works/${payload.workId}`,
    }
  },
})

const markWorkDoneTool = defineTool({
  ...WRITE_BASE,
  name: 'mark_work_done',
  description: 'Segna un lavoro come completato (stato Fatto, passa in archivio).',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro'),
    clientName: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const found = await resolveWork(ctx, { workQuery: input.workQuery, clientName: input.clientName, scope: 'active' })
    if (found.ok === false) return found
    const { work } = found
    const payload = { workId: work.id, status: 'DONE' as const }
    return queueWrite(ctx, 'mark_work_done', payload, {
      title: 'Completa lavoro',
      summary: work.title,
      fields: [
        { label: 'Lavoro', value: work.title },
        { label: 'Cliente', value: work.clientName },
        { label: 'Stato', value: `${workStatusLabel(work.status)} → ${workStatusLabel('DONE')}` },
      ],
      href: `/works/${work.id}`,
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: { workId: string; status: 'DONE' }) => {
    await moveWorkStatusOnBoard({ workId: payload.workId, status: 'DONE' })
    return {
      ok: true,
      summary: 'Lavoro segnato come fatto e archiviato.',
      entityType: 'Work',
      entityId: payload.workId,
      href: `/works/${payload.workId}`,
    }
  },
})

const reactivateWorkTool = defineTool({
  ...WRITE_BASE,
  name: 'reactivate_work',
  description: 'Riattiva un lavoro archiviato (Fatto → Da fare).',
  inputSchema: z.object({
    workQuery: z.string().optional().describe('Titolo (o parte) del lavoro archiviato'),
    clientName: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const found = await resolveWork(ctx, { workQuery: input.workQuery, clientName: input.clientName, scope: 'done' })
    if (found.ok === false) return found
    const { work } = found
    const payload = { workId: work.id }
    return queueWrite(ctx, 'reactivate_work', payload, {
      title: 'Riattiva lavoro',
      summary: work.title,
      fields: [
        { label: 'Lavoro', value: work.title },
        { label: 'Cliente', value: work.clientName },
        { label: 'Stato', value: `${workStatusLabel('DONE')} → ${workStatusLabel('TODO')}` },
      ],
      href: `/works/${work.id}`,
      entityType: 'Work',
      risk: 'medium',
    })
  },
  commit: async (payload: { workId: string }) => {
    await reactivateWork(payload)
    return {
      ok: true,
      summary: 'Lavoro riattivato (Da fare).',
      entityType: 'Work',
      entityId: payload.workId,
      href: `/works/${payload.workId}`,
    }
  },
})

export const workTools = [
  listActiveWorks,
  listWorksForUser,
  listOverdueWorks,
  getWorkDueHistory,
  createWorkTool,
  updateWorkStatusTool,
  rescheduleWorkDeadlineTool,
  reassignWorkTool,
  markWorkDoneTool,
  reactivateWorkTool,
]
