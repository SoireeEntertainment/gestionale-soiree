import { z } from 'zod'
import {
  createClientShooting,
  createShootingReel,
  getClientShootings,
} from '@/app/actions/client-shootings'
import { formatDateItFromYmd } from '@/lib/assistant-v2/dates'
import {
  MAX_ITEMS,
  clientAccessFilter,
  defineTool,
  queueWrite,
  resolveClient,
  resolveDate,
} from '@/lib/assistant-v2/tools/helpers'
import type { ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type { ToolErrorResult } from '@/lib/assistant-v2/types'
import { prisma } from '@/lib/prisma'
import { dbDateToDateOnly } from '@/lib/timeline-dates'

function ymd(d: Date | string): string {
  return dbDateToDateOnly(d)
}

/* ------------------------------- LETTURE --------------------------------- */

const listClientShootings = defineTool({
  name: 'list_client_shootings',
  description: 'Elenca gli shooting di un cliente con gli argomenti Reel (pubblicati / da pubblicare).',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'shootings_read',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Nome cliente; se omesso usa il cliente della conversazione'),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName)
    if (client.ok === false) return client

    const rows = await getClientShootings(client.id)
    const shootings = rows.slice(0, MAX_ITEMS).map((s) => ({
      id: s.id,
      name: s.name,
      date: ymd(s.date),
      location: s.location,
      totalReels: s.totalReels,
      publishedReels: s.publishedReels,
      reels: s.reels.map((r) => ({
        id: r.id,
        topic: r.topic,
        published: r.published,
        pedTaskDate: r.pedTaskDate,
      })),
    }))
    const pending = rows.reduce((n, s) => n + (s.totalReels - s.publishedReels), 0)

    return {
      ok: true,
      summary:
        rows.length === 0
          ? `Nessuno shooting per ${client.name}.`
          : `${client.name}: ${rows.length} shooting, ${pending} Reel da pubblicare.`,
      data: { client: { id: client.id, name: client.name }, shootings },
      href: `/clients/${client.id}`,
      entityType: 'ClientShooting',
      quickLinks: [{ label: `Apri ${client.name}`, href: `/clients/${client.id}` }],
    }
  },
})

const listUnpublishedReels = defineTool({
  name: 'list_unpublished_reels',
  description: 'Elenca gli argomenti Reel degli shooting non ancora pubblicati, per tutti i clienti accessibili o per uno solo.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'shootings_read',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Se omesso: tutti i clienti accessibili'),
    onlyUnplanned: z.boolean().optional().describe('true = solo Reel senza task PED collegata'),
  }),
  execute: async (input, ctx) => {
    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }

    const rows = await prisma.shootingReel.findMany({
      where: {
        published: false,
        ...(input.onlyUnplanned ? { pedTask: null } : {}),
        shooting: {
          ...(clientId ? { clientId } : {}),
          client: clientAccessFilter(ctx.auth),
        },
      },
      select: {
        id: true,
        topic: true,
        shooting: { select: { id: true, name: true, date: true, client: { select: { id: true, name: true } } } },
        pedTask: { select: { id: true, date: true } },
      },
      orderBy: [{ shooting: { date: 'desc' } }, { createdAt: 'asc' }],
      take: MAX_ITEMS,
    })

    const reels = rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      shootingName: r.shooting.name,
      shootingDate: ymd(r.shooting.date),
      clientName: r.shooting.client.name,
      pedTaskDate: r.pedTask ? ymd(r.pedTask.date) : null,
    }))

    return {
      ok: true,
      summary: reels.length === 0 ? 'Nessun Reel da pubblicare.' : `${reels.length} Reel non ancora pubblicati.`,
      data: { reels },
      href: clientId ? `/clients/${clientId}` : '/clients',
      entityType: 'ShootingReel',
    }
  },
})

/* ------------------------------- SCRITTURE ------------------------------- */

type CreateShootingPayload = {
  clientId: string
  date: string
  name: string
  location: string | null
  notes: string | null
  topics: string[]
}

const createShooting = defineTool({
  name: 'create_shooting',
  description: 'Crea uno shooting per un cliente con almeno un argomento Reel (richiede conferma).',
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'shootings_write',
  inputSchema: z.object({
    clientName: z.string().describe('Nome cliente (mai ID)'),
    datePhrase: z.string().describe('es. venerdì, 20 novembre'),
    name: z.string().min(1).max(200).describe('Nome dello shooting'),
    topics: z.array(z.string().min(1)).min(1).describe('Argomenti Reel, almeno uno'),
    location: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (client.ok === false) return client
    const date = resolveDate(input.datePhrase)
    if (date.ok === false) return date

    const topics = [...new Map(input.topics.map((t) => [t.trim().toLowerCase(), t.trim()] as const)).values()].filter(Boolean)
    if (topics.length === 0) return { ok: false, error: 'Serve almeno un argomento Reel.', clarify: true }

    const payload: CreateShootingPayload = {
      clientId: client.id,
      date: date.date,
      name: input.name.trim(),
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      topics,
    }

    return queueWrite(ctx, 'create_shooting', payload, {
      title: 'Crea shooting',
      summary: `${payload.name} — ${client.name}`,
      fields: [
        { label: 'Cliente', value: client.name },
        { label: 'Nome', value: payload.name },
        { label: 'Data', value: formatDateItFromYmd(date.date) },
        ...(payload.location ? [{ label: 'Luogo', value: payload.location }] : []),
        { label: 'Argomenti Reel', value: topics.join(' • ') },
      ],
      href: `/clients/${client.id}`,
      entityType: 'ClientShooting',
      risk: 'medium',
    })
  },
  commit: async (payload: CreateShootingPayload) => {
    const res = await createClientShooting(payload)
    return {
      ok: true,
      summary: `Shooting creato: «${res.name}» con ${res.totalReels} argomenti Reel.`,
      entityType: 'ClientShooting',
      entityId: res.id,
      href: `/clients/${payload.clientId}`,
      data: { id: res.id, name: res.name, totalReels: res.totalReels },
    }
  },
})

async function resolveShooting(
  ctx: ToolExecutionContext,
  input: { clientName?: string | null; shootingQuery?: string | null }
): Promise<
  | { ok: true; client: { id: string; name: string }; shooting: { id: string; name: string; date: string; topics: string[] } }
  | ToolErrorResult
> {
  const client = await resolveClient(ctx, input.clientName)
  if (client.ok === false) return client

  const all = await getClientShootings(client.id)
  if (all.length === 0) {
    return { ok: false, error: `${client.name} non ha shooting. Vuoi crearne uno?`, clarify: true }
  }
  const q = input.shootingQuery?.trim().toLowerCase()
  const matches = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all
  if (matches.length === 0) {
    return { ok: false, error: `Nessuno shooting di ${client.name} corrisponde a "${input.shootingQuery}".`, clarify: true }
  }

  const exact = q ? matches.filter((s) => s.name.toLowerCase() === q) : []
  const pick = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null
  if (!pick) {
    return {
      ok: false,
      error: 'Più shooting corrispondono. Quale intendi?',
      clarify: true,
      choices: matches.slice(0, 8).map((s) => ({ id: s.id, label: `${s.name} — ${formatDateItFromYmd(ymd(s.date))}` })),
    }
  }
  return {
    ok: true,
    client: { id: client.id, name: client.name },
    shooting: { id: pick.id, name: pick.name, date: ymd(pick.date), topics: pick.reels.map((r) => r.topic) },
  }
}

const addShootingReel = defineTool({
  name: 'add_shooting_reel',
  description: 'Aggiunge un argomento Reel a uno shooting esistente di un cliente (richiede conferma).',
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'shootings_write',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Nome cliente; se omesso usa il cliente della conversazione'),
    shootingQuery: z.string().optional().describe('Nome (o parte) dello shooting; se il cliente ne ha uno solo si può omettere'),
    topic: z.string().min(1).max(300).describe('Argomento del Reel'),
  }),
  execute: async (input, ctx) => {
    const found = await resolveShooting(ctx, input)
    if (found.ok === false) return found
    const topic = input.topic.trim()

    if (found.shooting.topics.some((t) => t.trim().toLowerCase() === topic.toLowerCase())) {
      return { ok: false, error: `L'argomento «${topic}» è già presente nello shooting «${found.shooting.name}».` }
    }

    const payload = { shootingId: found.shooting.id, clientId: found.client.id, topic }
    return queueWrite(ctx, 'add_shooting_reel', payload, {
      title: 'Aggiungi argomento Reel',
      summary: `${topic} — ${found.shooting.name}`,
      fields: [
        { label: 'Cliente', value: found.client.name },
        { label: 'Shooting', value: `${found.shooting.name} (${formatDateItFromYmd(found.shooting.date)})` },
        { label: 'Argomento', value: topic },
      ],
      href: `/clients/${found.client.id}`,
      entityType: 'ShootingReel',
      risk: 'medium',
    })
  },
  commit: async (payload: { shootingId: string; clientId: string; topic: string }) => {
    const reel = await createShootingReel(payload.shootingId, payload.topic)
    return {
      ok: true,
      summary: `Argomento Reel aggiunto: «${reel.topic}».`,
      entityType: 'ShootingReel',
      entityId: reel.id,
      href: `/clients/${payload.clientId}`,
    }
  },
})

export const shootingTools = [listClientShootings, listUnpublishedReels, createShooting, addShootingReel]
