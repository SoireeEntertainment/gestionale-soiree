/**
 * PED = Piano Editoriale (contenuti social: Reel, Post, Story, ecc. per cliente).
 * NON sono le task giornaliere (/tasks): per quelle vedi ./daily-tasks.
 */
import { z } from 'zod'
import {
  bulkMovePedItems,
  createPedItem,
  deletePedItem,
  duplicatePedItem,
  getPedMonth,
  setPedItemLabel,
  togglePedItemDone,
  updatePedItem,
} from '@/app/actions/ped'
import { formatDateItFromYmd, resolveItalianDatePhrase } from '@/lib/assistant-v2/dates'
import {
  MAX_ITEMS,
  defineTool,
  queueWrite,
  requireAdmin,
  resolveClient,
  resolveDate,
  resolveUser,
  resolveUserOrSelf,
} from '@/lib/assistant-v2/tools/helpers'
import type { ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type { ToolErrorResult } from '@/lib/assistant-v2/types'
import { prisma } from '@/lib/prisma'
import { getEffectiveLabel, PED_LABEL_CONFIG } from '@/lib/pedLabels'
import { addDaysToDateString, getISOWeekStartKey, toDateString } from '@/lib/ped-utils'
import { PED_ITEM_TYPES, PED_LABELS, PED_PLATFORMS } from '@/lib/validations'

const PED_NOTE =
  'Contenuti del Piano Editoriale (PED), non task giornaliere. Per le task di /tasks usa gli strumenti delle task giornaliere.'

/** Tipi che rappresentano un contenuto da pubblicare; gli altri sono attività di lavoro. */
const CONTENT_TYPES = new Set<string>(['REEL', 'POST', 'STORY', 'CAROUSEL', 'ADV', 'SHOOTING', 'OTHER'])

function labelText(label: string): string {
  return (PED_LABEL_CONFIG as Record<string, { label?: string }>)[label]?.label ?? label
}

/* ------------------------------- LETTURE --------------------------------- */

const listPedWeek = defineTool({
  name: 'list_ped_week',
  description: `Elenca i contenuti PED (piano editoriale) di una settimana ISO (lun–dom) per una persona, con scadenze lavori mostrate nel PED. ${PED_NOTE}`,
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'ped_read',
  inputSchema: z.object({
    dateInWeekPhrase: z
      .string()
      .optional()
      .describe('Un giorno qualsiasi della settimana, es. oggi, settimana prossima, 20 novembre. Default: questa settimana'),
    userName: z.string().optional().describe('PED di chi; vuoto = utente corrente'),
    clientName: z.string().optional().describe('Filtra per cliente'),
    onlyOpen: z.boolean().optional().describe('true = solo non fatti'),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied

    const anchor = resolveDate(input.dateInWeekPhrase?.trim() || 'oggi')
    if (anchor.ok === false) return anchor
    const user = await resolveUserOrSelf(ctx, input.userName)
    if (user.ok === false) return user

    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }

    const weekStart = getISOWeekStartKey(anchor.date)
    const weekEnd = addDaysToDateString(weekStart, 6)
    const [y, m] = weekStart.split('-').map(Number)

    const month = await getPedMonth(y, m, user.id)

    let items = month.pedItems
      .map((i) => ({ i, day: toDateString(new Date(i.date)) }))
      .filter(({ i, day }) => day >= weekStart && day <= weekEnd && (!clientId || i.clientId === clientId))
      .filter(({ i }) => !input.onlyOpen || i.status !== 'DONE')

    items = items.sort((a, b) => a.day.localeCompare(b.day))

    const pedItems = items.slice(0, MAX_ITEMS).map(({ i, day }) => {
      const label = getEffectiveLabel(i)
      return {
        id: i.id,
        date: day,
        type: i.type,
        kind: i.kind,
        title: i.title,
        clientName: i.client.name,
        label,
        labelText: labelText(label),
        done: i.status === 'DONE',
        isExtra: i.isExtra,
        assignedTo: i.assignedTo?.name ?? null,
        platforms: i.platforms,
        reelTopic: i.shootingReel?.topic ?? null,
      }
    })

    const workDeadlines = month.assignedWorkDeadlines
      .filter((w) => w.date >= weekStart && w.date <= weekEnd && (!clientId || w.clientId === clientId))
      .map((w) => ({
        workId: w.id,
        date: w.date,
        title: w.title,
        clientName: w.client.name,
        status: w.status,
      }))

    const done = items.filter(({ i }) => i.status === 'DONE').length
    return {
      ok: true,
      summary:
        items.length === 0
          ? `Nessun contenuto PED per ${user.name} dal ${formatDateItFromYmd(weekStart)} al ${formatDateItFromYmd(weekEnd)}.`
          : `PED di ${user.name} (${formatDateItFromYmd(weekStart)}–${formatDateItFromYmd(weekEnd)}): ${items.length} contenuti, ${done} fatti.`,
      data: {
        note: PED_NOTE,
        user: { id: user.id, name: user.name },
        weekStart,
        weekEnd,
        total: items.length,
        done,
        pedItems,
        workDeadlines,
      },
      href: '/ped',
      entityType: 'PedItem',
      quickLinks: [{ label: 'Apri PED', href: '/ped' }],
    }
  },
})

/* ------------------------------- SCRITTURE ------------------------------- */

type PedItemRef = {
  id: string
  title: string
  date: string
  type: string
  status: string
  isExtra: boolean
  clientName: string
}

/** Cerca un contenuto PED tra quelli modificabili dall'utente (owner o assegnatario). */
async function resolvePedItem(
  ctx: ToolExecutionContext,
  input: { itemQuery: string; clientName?: string | null; datePhrase?: string | null }
): Promise<{ ok: true; item: PedItemRef } | ToolErrorResult> {
  const uid = ctx.auth.currentUserId
  let clientId: string | undefined
  if (input.clientName?.trim()) {
    const c = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (c.ok === false) return c
    clientId = c.id
  }

  let dateWhere: { gte: Date; lte: Date } | undefined
  if (input.datePhrase?.trim()) {
    const d = resolveItalianDatePhrase(input.datePhrase)
    if (!d.date) return { ok: false, error: `Non ho capito la data "${input.datePhrase}".`, clarify: true }
    dateWhere = {
      gte: new Date(`${d.date}T00:00:00.000Z`),
      lte: new Date(`${d.date}T23:59:59.999Z`),
    }
  }

  const q = input.itemQuery.trim()
  const rows = await prisma.pedItem.findMany({
    where: {
      OR: [{ ownerId: uid }, { assignedToUserId: uid }],
      title: { contains: q, mode: 'insensitive' },
      ...(clientId ? { clientId } : {}),
      ...(dateWhere ? { date: dateWhere } : {}),
    },
    select: {
      id: true,
      title: true,
      date: true,
      type: true,
      status: true,
      isExtra: true,
      client: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 8,
  })
  if (rows.length === 0) {
    return { ok: false, error: `Nessun contenuto PED trovato per "${q}".`, clarify: true }
  }
  const refs: PedItemRef[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: toDateString(new Date(r.date)),
    type: r.type,
    status: r.status,
    isExtra: r.isExtra,
    clientName: r.client.name,
  }))
  if (refs.length === 1) return { ok: true, item: refs[0] }
  const exact = refs.filter((r) => r.title.toLowerCase() === q.toLowerCase())
  if (exact.length === 1) return { ok: true, item: exact[0] }
  return {
    ok: false,
    error: 'Più contenuti PED corrispondono. Quale intendi?',
    clarify: true,
    choices: refs.map((r) => ({
      id: r.id,
      label: `${r.title} — ${r.clientName} (${r.type}, ${formatDateItFromYmd(r.date)}${r.status === 'DONE' ? ', fatto' : ''})`,
    })),
  }
}

type CreatePedPayload = {
  clientId: string
  date: string
  kind: 'CONTENT' | 'WORK_TASK'
  type: (typeof PED_ITEM_TYPES)[number]
  title: string
  description: string | null
  label?: (typeof PED_LABELS)[number]
  platforms?: (typeof PED_PLATFORMS)[number][]
  isExtra: boolean
  assignedToUserId: string | null
}

const createPedItemTool = defineTool({
  name: 'create_ped_item',
  description: `Aggiunge un contenuto al PED (piano editoriale) di un cliente in una data (richiede conferma). ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    clientName: z.string().describe('Nome cliente (mai ID)'),
    datePhrase: z.string().describe('es. domani, venerdì, 20 novembre'),
    type: z.enum(PED_ITEM_TYPES).describe('REEL, POST, STORY, CAROUSEL, ADV, ...'),
    title: z.string().min(1).max(200),
    description: z.string().optional().nullable(),
    label: z.enum(PED_LABELS).optional().describe('Etichetta; default DA_FARE'),
    platforms: z.array(z.enum(PED_PLATFORMS)).optional(),
    isExtra: z.boolean().optional().describe('true = colonna Extra della settimana'),
    assigneeName: z.string().optional().describe('Assegna a un’altra persona; default utente corrente'),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (client.ok === false) return client
    const date = resolveDate(input.datePhrase)
    if (date.ok === false) return date

    let assignedToUserId: string | null = null
    let assigneeLabel = ctx.auth.user.name
    if (input.assigneeName?.trim()) {
      const u = await resolveUser(input.assigneeName)
      if (u.ok === false) return u
      assignedToUserId = u.id
      assigneeLabel = u.name
    }

    const payload: CreatePedPayload = {
      clientId: client.id,
      date: date.date,
      kind: CONTENT_TYPES.has(input.type) ? 'CONTENT' : 'WORK_TASK',
      type: input.type,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      label: input.label,
      platforms: input.platforms,
      isExtra: input.isExtra ?? false,
      assignedToUserId,
    }

    return queueWrite(ctx, 'create_ped_item', payload, {
      title: 'Aggiungi al PED',
      summary: `${payload.title} — ${client.name}`,
      fields: [
        { label: 'Titolo', value: payload.title },
        { label: 'Cliente', value: client.name },
        { label: 'Tipo', value: payload.type },
        { label: 'Data', value: formatDateItFromYmd(date.date) + (payload.isExtra ? ' (Extra)' : '') },
        { label: 'Etichetta', value: labelText(payload.label ?? 'DA_FARE') },
        { label: 'Assegnato a', value: assigneeLabel },
        ...(payload.platforms?.length ? [{ label: 'Piattaforme', value: payload.platforms.join(', ') }] : []),
      ],
      href: '/ped',
      entityType: 'PedItem',
      risk: 'medium',
    })
  },
  commit: async (payload: CreatePedPayload) => {
    const res = await createPedItem(payload)
    return {
      ok: true,
      summary: `Contenuto PED creato per il ${formatDateItFromYmd(payload.date)}: «${payload.title}».`,
      entityType: 'PedItem',
      entityId: res.id,
      href: '/ped',
      data: res,
    }
  },
})

const togglePedDone = defineTool({
  name: 'toggle_ped_done',
  description: `Segna un contenuto PED come fatto o da fare (richiede conferma). ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1).describe('Titolo (o parte) del contenuto PED'),
    clientName: z.string().optional(),
    datePhrase: z.string().optional().describe('Giorno in cui si trova il contenuto, per disambiguare'),
    done: z.boolean().optional().describe('true = fatto, false = da fare; omesso = inverte lo stato'),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, input)
    if (found.ok === false) return found
    const { item } = found

    const isDone = item.status === 'DONE'
    if (input.done !== undefined && input.done === isDone) {
      return { ok: false, error: `«${item.title}» è già ${isDone ? 'fatto' : 'da fare'}.` }
    }
    const next = !isDone

    const payload = { itemId: item.id }
    return queueWrite(ctx, 'toggle_ped_done', payload, {
      title: next ? 'Segna contenuto PED come fatto' : 'Riapri contenuto PED',
      summary: item.title,
      fields: [
        { label: 'Contenuto', value: item.title },
        { label: 'Cliente', value: item.clientName },
        { label: 'Data', value: formatDateItFromYmd(item.date) },
        { label: 'Stato', value: `${isDone ? 'Fatto' : 'Da fare'} → ${next ? 'Fatto' : 'Da fare'}` },
      ],
      href: '/ped',
      entityType: 'PedItem',
      risk: 'medium',
    })
  },
  commit: async (payload: { itemId: string }) => {
    const res = await togglePedItemDone(payload.itemId)
    if (!res.ok) return { ok: false, error: res.error ?? 'Impossibile aggiornare il contenuto PED.' }
    return {
      ok: true,
      summary: 'Stato del contenuto PED aggiornato.',
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

const movePedItemDate = defineTool({
  name: 'move_ped_item_date',
  description: `Sposta un contenuto PED a un'altra data (richiede conferma). Non modifica scadenze dei lavori. ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1).describe('Titolo (o parte) del contenuto PED'),
    clientName: z.string().optional(),
    currentDatePhrase: z.string().optional().describe('Data attuale del contenuto, per disambiguare'),
    newDatePhrase: z.string().describe('Nuova data, es. domani, lunedì, 25 novembre'),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, {
      itemQuery: input.itemQuery,
      clientName: input.clientName,
      datePhrase: input.currentDatePhrase,
    })
    if (found.ok === false) return found
    const { item } = found

    const target = resolveDate(input.newDatePhrase)
    if (target.ok === false) return target
    if (target.date === item.date && !item.isExtra) {
      return { ok: false, error: `«${item.title}» è già il ${formatDateItFromYmd(item.date)}.` }
    }

    const payload = { itemId: item.id, targetDate: target.date, targetIsExtra: false }
    return queueWrite(ctx, 'move_ped_item_date', payload, {
      title: 'Sposta contenuto PED',
      summary: item.title,
      fields: [
        { label: 'Contenuto', value: item.title },
        { label: 'Cliente', value: item.clientName },
        { label: 'Data', value: `${formatDateItFromYmd(item.date)}${item.isExtra ? ' (Extra)' : ''} → ${formatDateItFromYmd(target.date)}` },
      ],
      href: '/ped',
      entityType: 'PedItem',
      risk: 'medium',
    })
  },
  commit: async (payload: { itemId: string; targetDate: string; targetIsExtra: boolean }) => {
    const res = await bulkMovePedItems([payload.itemId], payload.targetDate, payload.targetIsExtra)
    if (res.error || res.applied === 0) {
      return { ok: false, error: res.error ?? 'Non posso spostare questo contenuto PED.' }
    }
    return {
      ok: true,
      summary: `Contenuto PED spostato al ${formatDateItFromYmd(payload.targetDate)}.`,
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

const listPedDay = defineTool({
  name: 'list_ped_day',
  description: `Elenca i contenuti PED di un giorno specifico (es. oggi, domani, venerdì) per una persona. ${PED_NOTE}`,
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'ped_read',
  inputSchema: z.object({
    datePhrase: z.string().optional().describe('Default: oggi'),
    userName: z.string().optional(),
    clientName: z.string().optional(),
    onlyOpen: z.boolean().optional(),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied

    const day = resolveDate(input.datePhrase?.trim() || 'oggi')
    if (day.ok === false) return day
    const user = await resolveUserOrSelf(ctx, input.userName)
    if (user.ok === false) return user

    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }

    const [y, m] = day.date.split('-').map(Number)
    const month = await getPedMonth(y, m, user.id)
    let items = month.pedItems
      .map((i) => ({ i, day: toDateString(new Date(i.date)) }))
      .filter(({ i, day: d }) => d === day.date && (!clientId || i.clientId === clientId))
      .filter(({ i }) => !input.onlyOpen || i.status !== 'DONE')
      .sort((a, b) => a.day.localeCompare(b.day))

    const pedItems = items.slice(0, MAX_ITEMS).map(({ i, day: d }) => {
      const label = getEffectiveLabel(i)
      return {
        id: i.id,
        date: d,
        type: i.type,
        title: i.title,
        clientName: i.client.name,
        label,
        labelText: labelText(label),
        done: i.status === 'DONE',
        isExtra: i.isExtra,
        assignedTo: i.assignedTo?.name ?? null,
        platforms: i.platforms,
      }
    })

    const workDeadlines = month.assignedWorkDeadlines
      .filter((w) => w.date === day.date && (!clientId || w.clientId === clientId))
      .map((w) => ({
        workId: w.id,
        date: w.date,
        title: w.title,
        clientName: w.client.name,
        status: w.status,
      }))

    return {
      ok: true,
      summary:
        pedItems.length === 0
          ? `Nessun contenuto PED per ${user.name} il ${formatDateItFromYmd(day.date)}.`
          : `PED di ${user.name} il ${formatDateItFromYmd(day.date)}: ${pedItems.length} contenuti.`,
      data: {
        note: PED_NOTE,
        date: day.date,
        pedItems,
        workDeadlines,
      },
      href: '/ped',
      entityType: 'PedItem',
    }
  },
})

const setPedLabelTool = defineTool({
  name: 'set_ped_label',
  description: `Imposta l'etichetta PED (IN_APPROVAZIONE, DA_FARE, PRONTO_NON_PUBBLICATO, FATTO). Sincronizza ShootingReel se previsto. ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1),
    clientName: z.string().optional(),
    datePhrase: z.string().optional(),
    label: z.enum(PED_LABELS),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, input)
    if (found.ok === false) return found
    const { item } = found
    return queueWrite(
      ctx,
      'set_ped_label',
      { itemId: item.id, label: input.label },
      {
        title: 'Cambia etichetta PED',
        summary: item.title,
        fields: [
          { label: 'Contenuto', value: item.title },
          { label: 'Cliente', value: item.clientName },
          { label: 'Etichetta', value: labelText(input.label) },
        ],
        href: '/ped',
        entityType: 'PedItem',
        risk: 'medium',
      }
    )
  },
  commit: async (payload: { itemId: string; label: (typeof PED_LABELS)[number] }) => {
    const res = await setPedItemLabel(payload.itemId, payload.label)
    if (!res.ok) return { ok: false, error: res.error ?? 'Impossibile aggiornare etichetta.' }
    return {
      ok: true,
      summary: `Etichetta aggiornata a ${labelText(payload.label)}.`,
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

const updatePedItemTool = defineTool({
  name: 'update_ped_item',
  description: `Modifica titolo/descrizione/tipo/piattaforme/extra di un contenuto PED. ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1),
    clientName: z.string().optional(),
    datePhrase: z.string().optional(),
    newTitle: z.string().optional(),
    newDescription: z.string().optional().nullable(),
    newType: z.enum(PED_ITEM_TYPES).optional(),
    platforms: z.array(z.enum(PED_PLATFORMS)).optional(),
    isExtra: z.boolean().optional(),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, input)
    if (found.ok === false) return found
    if (
      !input.newTitle &&
      input.newDescription === undefined &&
      !input.newType &&
      !input.platforms &&
      input.isExtra === undefined
    ) {
      return { ok: false, error: 'Indica cosa modificare (titolo, descrizione, tipo, piattaforme, extra).', clarify: true }
    }
    const { item } = found
    const payload = {
      itemId: item.id,
      title: input.newTitle?.trim(),
      description: input.newDescription,
      type: input.newType,
      platforms: input.platforms,
      isExtra: input.isExtra,
      expectedUpdatedHint: item.title,
    }
    return queueWrite(ctx, 'update_ped_item', payload, {
      title: 'Modifica contenuto PED',
      summary: item.title,
      fields: [
        { label: 'Contenuto', value: item.title },
        { label: 'Cliente', value: item.clientName },
        ...(payload.title ? [{ label: 'Nuovo titolo', value: payload.title }] : []),
        ...(payload.type ? [{ label: 'Tipo', value: payload.type }] : []),
        ...(payload.platforms ? [{ label: 'Piattaforme', value: payload.platforms.join(', ') }] : []),
        ...(payload.isExtra !== undefined
          ? [{ label: 'Extra', value: payload.isExtra ? 'sì' : 'no' }]
          : []),
      ],
      href: '/ped',
      entityType: 'PedItem',
      risk: 'medium',
    })
  },
  commit: async (payload: {
    itemId: string
    title?: string
    description?: string | null
    type?: (typeof PED_ITEM_TYPES)[number]
    platforms?: (typeof PED_PLATFORMS)[number][]
    isExtra?: boolean
  }) => {
    await updatePedItem(payload.itemId, {
      title: payload.title,
      description: payload.description,
      type: payload.type,
      platforms: payload.platforms,
      isExtra: payload.isExtra,
    })
    return {
      ok: true,
      summary: 'Contenuto PED aggiornato.',
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

const deletePedItemTool = defineTool({
  name: 'delete_ped_item',
  description: `Elimina un contenuto PED (richiede conferma). ${PED_NOTE}`,
  kind: 'write',
  risk: 'destructive',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1),
    clientName: z.string().optional(),
    datePhrase: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, input)
    if (found.ok === false) return found
    const { item } = found
    return queueWrite(
      ctx,
      'delete_ped_item',
      { itemId: item.id },
      {
        title: 'Elimina contenuto PED',
        summary: item.title,
        fields: [
          { label: 'Contenuto', value: item.title },
          { label: 'Cliente', value: item.clientName },
          { label: 'Data', value: formatDateItFromYmd(item.date) },
        ],
        href: '/ped',
        entityType: 'PedItem',
        risk: 'destructive',
      }
    )
  },
  commit: async (payload: { itemId: string }) => {
    await deletePedItem(payload.itemId)
    return {
      ok: true,
      summary: 'Contenuto PED eliminato.',
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

const duplicatePedItemTool = defineTool({
  name: 'duplicate_ped_item',
  description: `Duplica un contenuto PED in una nuova data. ${PED_NOTE}`,
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'ped_write',
  inputSchema: z.object({
    itemQuery: z.string().min(1),
    clientName: z.string().optional(),
    currentDatePhrase: z.string().optional(),
    newDatePhrase: z.string(),
    isExtra: z.boolean().optional(),
  }),
  execute: async (input, ctx) => {
    const found = await resolvePedItem(ctx, {
      itemQuery: input.itemQuery,
      clientName: input.clientName,
      datePhrase: input.currentDatePhrase,
    })
    if (found.ok === false) return found
    const target = resolveDate(input.newDatePhrase)
    if (target.ok === false) return target
    const { item } = found
    return queueWrite(
      ctx,
      'duplicate_ped_item',
      { itemId: item.id, targetDate: target.date, targetIsExtra: input.isExtra ?? false },
      {
        title: 'Duplica contenuto PED',
        summary: item.title,
        fields: [
          { label: 'Contenuto', value: item.title },
          { label: 'Nuova data', value: formatDateItFromYmd(target.date) },
        ],
        href: '/ped',
        entityType: 'PedItem',
        risk: 'medium',
      }
    )
  },
  commit: async (payload: { itemId: string; targetDate: string; targetIsExtra: boolean }) => {
    await duplicatePedItem(payload.itemId, payload.targetDate, payload.targetIsExtra)
    return {
      ok: true,
      summary: `Contenuto PED duplicato al ${formatDateItFromYmd(payload.targetDate)}.`,
      entityType: 'PedItem',
      entityId: payload.itemId,
      href: '/ped',
    }
  },
})

export const pedTools = [
  listPedWeek,
  listPedDay,
  createPedItemTool,
  togglePedDone,
  setPedLabelTool,
  updatePedItemTool,
  movePedItemDate,
  duplicatePedItemTool,
  deletePedItemTool,
]
