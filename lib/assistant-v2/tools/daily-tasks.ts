import { z } from 'zod'
import {
  completeDailyTask,
  createDailyTask,
  deleteDailyTask,
  getClientUniverse,
  getMyDailyTasks,
  markClientContacted,
  markClientNeedsContact,
  reopenDailyTask,
  updateDailyTask,
} from '@/app/actions/daily-tasks'
import { resolveItalianDatePhrase, formatDateItFromYmd, todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import { resolveClientByName } from '@/lib/assistant-v2/resolve-client'
import { createPendingAction } from '@/lib/assistant-v2/confirmation/service'
import type { AssistantToolDefinition } from '@/lib/assistant-v2/tools/types'
import type { ToolHandlerResult } from '@/lib/assistant-v2/types'
import { addDaysLocal, formatDateOnly, parseDateOnly } from '@/lib/timeline-dates'

async function resolveDueDate(raw?: string | null): Promise<
  | { ok: true; date: string }
  | { ok: false; error: string }
> {
  if (!raw?.trim()) return { ok: true, date: todayDateOnlyRome() }
  const r = resolveItalianDatePhrase(raw)
  if (!r.date) return { ok: false, error: `Non ho capito la data "${raw}". Specifica ad esempio "domani" o "20 novembre".` }
  return { ok: true, date: r.date }
}

/**
 * Risolve un cliente opzionale per le DailyTask.
 * - Senza clientName e senza allowMemory → clientId null (task GENERAL senza cliente).
 * - allowMemory solo con riferimento contestuale inequivocabile ("quel cliente", …).
 * Non associa silenziosamente task/liste all’ultimo cliente in memoria.
 */
export async function resolveOptionalClient(
  ctx: Parameters<AssistantToolDefinition['execute']>[1],
  clientName?: string | null,
  opts?: { clientId?: string | null; allowMemory?: boolean }
): Promise<ToolHandlerResult | { ok: true; clientId: string | null; clientName: string | null }> {
  if (opts?.clientId) {
    return { ok: true, clientId: opts.clientId, clientName: null }
  }
  if (clientName?.trim()) {
    const match = await resolveClientByName(ctx.auth, clientName)
    if (match.status === 'found') return { ok: true, clientId: match.id, clientName: match.name }
    if (match.status === 'ambiguous') {
      return {
        ok: false,
        error: `Ho trovato più clienti per "${clientName}". Quale intendi?`,
        clarify: true,
        choices: match.choices,
      }
    }
    return {
      ok: false,
      error: `Cliente "${clientName}" non trovato. Vuoi crearne uno nuovo?`,
      clarify: true,
    }
  }
  if (opts?.allowMemory) {
    const mem = ctx.memory.lastClientId
    if (mem) {
      return {
        ok: true,
        clientId: mem,
        clientName: ctx.memory.lastClientName ?? null,
      }
    }
  }
  return { ok: true, clientId: null, clientName: null }
}

const clientFromContextField = z
  .boolean()
  .optional()
  .describe(
    'true SOLO se l’utente indica un riferimento contestuale inequivocabile al cliente già citato (es. "quel cliente", "lo stesso cliente", "per lui"). false/omesso se non menziona un cliente: non ereditare l’ultimo cliente dalla memoria.'
  )

export const dailyTaskTools: AssistantToolDefinition[] = [
  {
    name: 'list_daily_tasks',
    description:
      'Elenca le task giornaliere dell’utente (NON il PED editoriale). Filtri: oggi, scadute, settimana, completate, ricerca testo.',
    kind: 'read',
    risk: 'low',
    requiresConfirmation: false,
    permission: 'daily_tasks',
    inputSchema: z.object({
      bucket: z
        .enum(['today', 'overdue', 'week', 'done', 'open', 'all'])
        .default('today')
        .describe('today=oggi, overdue=scadute, week=prossimi 7 giorni, done=completate'),
      query: z.string().optional().describe('Filtro testo sul titolo'),
      clientName: z
        .string()
        .optional()
        .describe('Nome cliente se l’utente filtra esplicitamente (es. "task di Oneforall").'),
      clientFromContext: clientFromContextField,
    }),
    execute: async (input, ctx) => {
      const client = await resolveOptionalClient(ctx, input.clientName, {
        allowMemory: input.clientFromContext === true,
      })
      if (!('clientId' in client) || client.ok !== true) return client as ToolHandlerResult

      let tasks = await getMyDailyTasks({
        status: input.bucket === 'done' ? 'DONE' : input.bucket === 'all' ? 'ALL' : 'OPEN',
        dueBucket:
          input.bucket === 'today'
            ? 'TODAY'
            : input.bucket === 'overdue'
              ? 'OVERDUE'
              : input.bucket === 'week'
                ? 'UPCOMING'
                : 'ALL',
        q: input.query,
        // Solo filtro cliente se nome esplicito o riferimento contestuale; mai silent da memoria.
        clientId: client.clientId ?? undefined,
      })

      if (input.bucket === 'week') {
        const today = todayDateOnlyRome()
        const end = formatDateOnly(addDaysLocal(parseDateOnly(today), 7))
        tasks = tasks.filter((t) => t.dueDate >= today && t.dueDate <= end)
      }

      const items = tasks.slice(0, 40).map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        dueDate: t.dueDate,
        clientName: t.clientName,
      }))

      return {
        ok: true,
        summary:
          items.length === 0
            ? 'Nessuna task trovata con questi filtri.'
            : `Trovate ${items.length} task.`,
        data: { tasks: items },
        href: '/tasks',
        entityType: 'DailyTask',
        quickLinks: [{ label: 'Apri Task', href: '/tasks' }],
      }
    },
  },
  {
    name: 'create_daily_task',
    description:
      'Crea una task giornaliera GENERAL (promemoria). Se viene citato un cliente, collegarlo. Non usare per PED o Sentire cliente.',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'daily_tasks',
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      dueDatePhrase: z.string().describe('es. domani, venerdì, 20 novembre'),
      clientName: z
        .string()
        .optional()
        .nullable()
        .describe('Nome cliente solo se citato esplicitamente. Se assente → task GENERAL senza cliente.'),
      clientFromContext: clientFromContextField,
      notes: z.string().optional().nullable(),
    }),
    buildPreview: async (input, ctx) => {
      const due = await resolveDueDate(input.dueDatePhrase)
      const client = await resolveOptionalClient(ctx, input.clientName, {
        allowMemory: input.clientFromContext === true,
      })
      const clientLabel =
        client.ok === true && 'clientName' in client
          ? client.clientName || (client.clientId ? 'collegato' : 'nessuno')
          : input.clientName || 'nessuno'
      return {
        title: 'Crea task giornaliera',
        summary: input.title,
        fields: [
          { label: 'Titolo', value: input.title },
          { label: 'Scadenza', value: due.ok ? formatDateItFromYmd(due.date) : input.dueDatePhrase },
          { label: 'Cliente', value: String(clientLabel) },
          { label: 'Tipo', value: 'Generica' },
        ],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium',
      }
    },
    execute: async (input, ctx) => {
      const due = await resolveDueDate(input.dueDatePhrase)
      if (!due.ok) return { ok: false, error: due.error, clarify: true }
      const client = await resolveOptionalClient(ctx, input.clientName, {
        allowMemory: input.clientFromContext === true,
      })
      if (!('clientId' in client) || client.ok !== true) return client as ToolHandlerResult

      const payload = {
        title: input.title.trim(),
        type: 'GENERAL' as const,
        dueDate: due.date,
        clientId: client.clientId,
        notes: input.notes ?? null,
      }
      const preview = (await dailyTaskTools
        .find((t) => t.name === 'create_daily_task')!
        .buildPreview!(input, ctx))!

      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'create_daily_task',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'create_daily_task',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const created = await createDailyTask(input)
      return {
        ok: true,
        summary: `Task creata: «${created.title}» (scadenza ${formatDateItFromYmd(created.dueDate)}).`,
        entityType: 'DailyTask',
        entityId: created.id,
        href: '/tasks',
        data: created,
      }
    },
  },
  {
    name: 'update_daily_task',
    description: 'Modifica titolo, scadenza o note di una task giornaliera dell’utente.',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'daily_tasks',
    inputSchema: z.object({
      taskQuery: z.string().describe('Titolo o parte del titolo della task'),
      newTitle: z.string().optional(),
      newDueDatePhrase: z.string().optional(),
      notes: z.string().optional().nullable(),
    }),
    execute: async (input, ctx) => {
      const tasks = await getMyDailyTasks({ status: 'OPEN', q: input.taskQuery })
      if (tasks.length === 0) return { ok: false, error: 'Task non trovata.', clarify: true }
      if (tasks.length > 1) {
        return {
          ok: false,
          error: 'Più task corrispondono. Quale intendi?',
          clarify: true,
          choices: tasks.slice(0, 8).map((t) => ({
            id: t.id,
            label: `${t.title}${t.clientName ? ` (${t.clientName})` : ''} — ${formatDateItFromYmd(t.dueDate)}`,
          })),
        }
      }
      const task = tasks[0]
      let dueDate: string | undefined
      if (input.newDueDatePhrase) {
        const due = await resolveDueDate(input.newDueDatePhrase)
        if (!due.ok) return { ok: false, error: due.error, clarify: true }
        dueDate = due.date
      }
      const payload = {
        id: task.id,
        title: input.newTitle?.trim() || undefined,
        dueDate,
        notes: input.notes,
      }
      const preview = {
        title: 'Modifica task',
        summary: task.title,
        fields: [
          { label: 'Task', value: task.title },
          ...(input.newTitle ? [{ label: 'Nuovo titolo', value: input.newTitle }] : []),
          ...(dueDate ? [{ label: 'Nuova scadenza', value: formatDateItFromYmd(dueDate) }] : []),
        ],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'update_daily_task',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'update_daily_task',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const updated = await updateDailyTask(input)
      return {
        ok: true,
        summary: `Task aggiornata: «${updated.title}».`,
        entityType: 'DailyTask',
        entityId: updated.id,
        href: '/tasks',
        data: updated,
      }
    },
  },
  {
    name: 'complete_daily_task',
    description: 'Segna una task giornaliera come fatta (DONE).',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'daily_tasks',
    inputSchema: z.object({
      taskQuery: z.string(),
      clientName: z.string().optional(),
      clientFromContext: clientFromContextField,
    }),
    execute: async (input, ctx) => {
      const client = await resolveOptionalClient(ctx, input.clientName, {
        allowMemory: input.clientFromContext === true,
      })
      if (client.ok === false) return client
      const tasks = await getMyDailyTasks({
        status: 'OPEN',
        q: input.taskQuery,
        clientId: 'clientId' in client ? client.clientId ?? undefined : undefined,
      })
      if (tasks.length === 0) return { ok: false, error: 'Nessuna task aperta trovata.', clarify: true }
      if (tasks.length > 1) {
        return {
          ok: false,
          error: 'Più task aperte corrispondono. Quale?',
          clarify: true,
          choices: tasks.slice(0, 8).map((t) => ({
            id: t.id,
            label: `${t.title}${t.clientName ? ` (${t.clientName})` : ''}`,
          })),
        }
      }
      const task = tasks[0]
      const payload = { id: task.id }
      const preview = {
        title: 'Completa task',
        summary: task.title,
        fields: [
          { label: 'Task', value: task.title },
          { label: 'Cliente', value: task.clientName || '—' },
        ],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'complete_daily_task',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'complete_daily_task',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const updated = await completeDailyTask(input)
      return {
        ok: true,
        summary: `Task completata: «${updated.title}».`,
        entityType: 'DailyTask',
        entityId: updated.id,
        href: '/tasks',
      }
    },
  },
  {
    name: 'reopen_daily_task',
    description: 'Riapre una task giornaliera completata.',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'daily_tasks',
    inputSchema: z.object({ taskQuery: z.string() }),
    execute: async (input, ctx) => {
      const tasks = await getMyDailyTasks({ status: 'DONE', q: input.taskQuery })
      if (tasks.length === 0) return { ok: false, error: 'Nessuna task completata trovata.', clarify: true }
      const task = tasks[0]
      const payload = { taskId: task.id }
      const preview = {
        title: 'Riapri task',
        summary: task.title,
        fields: [{ label: 'Task', value: task.title }],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'reopen_daily_task',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'reopen_daily_task',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const updated = await reopenDailyTask(input.taskId as string)
      return {
        ok: true,
        summary: `Task riaperta: «${updated.title}».`,
        entityType: 'DailyTask',
        entityId: updated.id,
        href: '/tasks',
      }
    },
  },
  {
    name: 'delete_daily_task',
    description: 'Elimina una task giornaliera. Richiede conferma esplicita.',
    kind: 'write',
    risk: 'destructive',
    requiresConfirmation: true,
    permission: 'daily_tasks',
    inputSchema: z.object({ taskQuery: z.string() }),
    execute: async (input, ctx) => {
      const tasks = await getMyDailyTasks({ status: 'ALL', q: input.taskQuery })
      if (tasks.length === 0) return { ok: false, error: 'Task non trovata.', clarify: true }
      if (tasks.length > 1) {
        return {
          ok: false,
          error: 'Più task corrispondono. Quale eliminare?',
          clarify: true,
          choices: tasks.slice(0, 8).map((t) => ({
            id: t.id,
            label: `${t.title}${t.clientName ? ` (${t.clientName})` : ''}`,
          })),
        }
      }
      const task = tasks[0]
      const payload = { taskId: task.id }
      const preview = {
        title: 'Elimina task',
        summary: `Verrà eliminata definitivamente: «${task.title}»`,
        fields: [
          { label: 'Task', value: task.title },
          { label: 'Tipo', value: task.type },
          { label: 'Cliente', value: task.clientName || '—' },
        ],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'destructive' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'delete_daily_task',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'delete_daily_task',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const res = await deleteDailyTask(input.taskId as string)
      if (!res.success) return { ok: false, error: res.message, code: res.code }
      return {
        ok: true,
        summary: 'Task eliminata.',
        entityType: 'DailyTask',
        entityId: res.taskId,
        href: '/tasks',
      }
    },
  },
  {
    name: 'list_clients_to_contact',
    description:
      'Elenco clienti da sentire / già sentiti (Universo CONTACT_CLIENT). Distinto dalle task GENERAL e dal PED.',
    kind: 'read',
    risk: 'low',
    requiresConfirmation: false,
    permission: 'contact_client',
    inputSchema: z.object({
      status: z.enum(['to_contact', 'contacted', 'all']).default('to_contact'),
    }),
    execute: async (input) => {
      const nodes = await getClientUniverse()
      const filtered =
        input.status === 'to_contact'
          ? nodes.filter((n) => n.status === 'red')
          : input.status === 'contacted'
            ? nodes.filter((n) => n.status === 'green')
            : nodes
      return {
        ok: true,
        summary:
          filtered.length === 0
            ? 'Nessun cliente in questo stato.'
            : `${filtered.length} clienti (${input.status}).`,
        data: {
          clients: filtered.slice(0, 40).map((n) => ({
            clientId: n.clientId,
            name: n.clientName,
            status: n.status,
            lastContactedAt: n.lastContactedAt,
            nextReactivateAt: n.nextReactivateAt,
          })),
        },
        href: '/tasks',
        entityType: 'DailyTask',
      }
    },
  },
  {
    name: 'mark_client_contacted',
    description:
      'Segna un cliente come sentito oggi (CONTACT_CLIENT → verde). Opzionale nextReactivateAt.',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'contact_client',
    inputSchema: z.object({
      clientName: z.string(),
      nextReactivatePhrase: z.string().optional().nullable()
        .describe('es. fra una settimana, 20 novembre'),
      notes: z.string().optional().nullable(),
    }),
    execute: async (input, ctx) => {
      const match = await resolveClientByName(ctx.auth, input.clientName)
      if (match.status === 'ambiguous') {
        return {
          ok: false,
          error: `Più clienti per "${input.clientName}". Quale?`,
          clarify: true,
          choices: match.choices,
        }
      }
      if (match.status === 'not_found') {
        return { ok: false, error: `Cliente "${input.clientName}" non trovato.`, clarify: true }
      }
      let nextReactivateAt: string | null = null
      if (input.nextReactivatePhrase?.trim()) {
        const due = await resolveDueDate(input.nextReactivatePhrase)
        if (!due.ok) return { ok: false, error: due.error, clarify: true }
        nextReactivateAt = due.date
      }
      const payload = {
        clientId: match.id,
        nextReactivateAt,
      }
      const preview = {
        title: 'Segna cliente come sentito',
        summary: match.name,
        fields: [
          { label: 'Cliente', value: match.name },
          {
            label: 'Prossima riattivazione',
            value: nextReactivateAt ? formatDateItFromYmd(nextReactivateAt) : 'default (+7 giorni)',
          },
        ],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'mark_client_contacted',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'mark_client_contacted',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const updated = await markClientContacted({
        clientId: input.clientId as string,
        nextReactivateAt: (input.nextReactivateAt as string | null) ?? undefined,
      })
      return {
        ok: true,
        summary: `Cliente segnato come sentito. Prossima riattivazione: ${
          updated.nextReactivateAt ? formatDateItFromYmd(updated.nextReactivateAt) : '—'
        }.`,
        entityType: 'DailyTask',
        entityId: updated.id,
        href: '/tasks',
        data: updated,
      }
    },
  },
  {
    name: 'mark_client_needs_contact',
    description: 'Rimette un cliente tra quelli da sentire (CONTACT_CLIENT → rosso/OPEN).',
    kind: 'write',
    risk: 'medium',
    requiresConfirmation: true,
    permission: 'contact_client',
    inputSchema: z.object({
      clientName: z.string(),
      notes: z.string().optional().nullable(),
    }),
    execute: async (input, ctx) => {
      const match = await resolveClientByName(ctx.auth, input.clientName)
      if (match.status === 'ambiguous') {
        return {
          ok: false,
          error: `Più clienti per "${input.clientName}". Quale?`,
          clarify: true,
          choices: match.choices,
        }
      }
      if (match.status === 'not_found') {
        return { ok: false, error: `Cliente "${input.clientName}" non trovato.`, clarify: true }
      }
      const payload = {
        clientId: match.id,
      }
      const preview = {
        title: 'Rimetti cliente da sentire',
        summary: match.name,
        fields: [{ label: 'Cliente', value: match.name }],
        href: '/tasks',
        entityType: 'DailyTask',
        risk: 'medium' as const,
      }
      const pending = await createPendingAction({
        userId: ctx.auth.currentUserId,
        threadId: ctx.threadId,
        toolName: 'mark_client_needs_contact',
        payload,
        preview,
      })
      return {
        ok: true,
        needsConfirmation: true,
        pendingId: pending.pendingId,
        toolName: 'mark_client_needs_contact',
        preview,
        payload,
      }
    },
    commit: async (input) => {
      const clientId = input.clientId as string
      try {
        const updated = await markClientNeedsContact({ clientId })
        return {
          ok: true,
          summary: `«${updated.clientName ?? 'Cliente'}» rimesso tra i clienti da sentire.`,
          entityType: 'DailyTask',
          entityId: updated.id,
          href: '/tasks',
          data: updated,
        }
      } catch {
        // Nessun tracker esistente: creane uno OPEN (upsert CONTACT_CLIENT).
        const created = await createDailyTask({
          title: 'Sentire cliente',
          type: 'CONTACT_CLIENT',
          dueDate: todayDateOnlyRome(),
          clientId,
        })
        return {
          ok: true,
          summary: `Tracker “Sentire cliente” creato per «${created.clientName ?? 'Cliente'}».`,
          entityType: 'DailyTask',
          entityId: created.id,
          href: '/tasks',
          data: created,
        }
      }
    },
  },
  {
    name: 'get_client_last_contact',
    description: 'Quando è stato sentito l’ultima volta un cliente (lastContactedAt).',
    kind: 'read',
    risk: 'low',
    requiresConfirmation: false,
    permission: 'contact_client',
    inputSchema: z.object({ clientName: z.string() }),
    execute: async (input, ctx) => {
      const match = await resolveClientByName(ctx.auth, input.clientName)
      if (match.status === 'ambiguous') {
        return {
          ok: false,
          error: `Più clienti per "${input.clientName}". Quale?`,
          clarify: true,
          choices: match.choices,
        }
      }
      if (match.status === 'not_found') {
        return { ok: false, error: `Cliente "${input.clientName}" non trovato.`, clarify: true }
      }
      const nodes = await getClientUniverse()
      const node = nodes.find((n) => n.clientId === match.id)
      return {
        ok: true,
        summary: node?.lastContactedAt
          ? `Ultimo contatto con ${match.name}: ${formatDateItFromYmd(node.lastContactedAt)}.`
          : `Nessun contatto registrato per ${match.name}.`,
        data: node ?? { clientId: match.id, clientName: match.name },
        href: '/tasks',
      }
    },
  },
]
