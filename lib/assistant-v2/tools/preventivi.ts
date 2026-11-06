import { z } from 'zod'
import { getPreventivi } from '@/app/actions/preventivi'
import { todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import {
  MAX_ITEMS,
  clientAccessFilter,
  defineTool,
  resolveClient,
} from '@/lib/assistant-v2/tools/helpers'
import type { ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type { ToolErrorResult } from '@/lib/assistant-v2/types'
import { prisma } from '@/lib/prisma'
import { dbDateToDateOnly, diffCalendarDaysLocal, parseDateOnly } from '@/lib/timeline-dates'

const PREVENTIVO_STATUSES = ['BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO'] as const
type PreventivoStatus = (typeof PREVENTIVO_STATUSES)[number]

const STATUS_LABEL: Record<string, string> = {
  BOZZA: 'Bozza',
  INVIATO: 'Inviato',
  ACCETTATO: 'Accettato',
  RIFIUTATO: 'Rifiutato',
}

type Filters = {
  statuses?: PreventivoStatus[]
  clientName?: string | null
  query?: string | null
}

async function queryPreventivi(
  ctx: ToolExecutionContext,
  filters: Filters
): Promise<
  | {
      ok: true
      total: number
      totalAmount: number
      byStatus: Record<string, number>
      items: {
        id: string
        title: string
        clientName: string | null
        isProspect: boolean
        status: string
        statusLabel: string
        totalAmount: number | null
        createdAt: string
        ageDays: number
        type: string
      }[]
      clientId?: string
    }
  | ToolErrorResult
> {
  let clientId: string | undefined
  if (filters.clientName?.trim()) {
    const c = await resolveClient(ctx, filters.clientName, { useMemory: false })
    if (c.ok === false) return c
    clientId = c.id
  }

  // getPreventivi non filtra per accesso: limitiamo ai clienti accessibili (AGENTE: niente prospect).
  let allowedClientIds: Set<string> | null = null
  if (!ctx.auth.permissions.canReadAllClients) {
    const rows = await prisma.client.findMany({
      where: clientAccessFilter(ctx.auth),
      select: { id: true },
    })
    allowedClientIds = new Set(rows.map((r) => r.id))
  }

  const today = todayDateOnlyRome()
  const q = filters.query?.trim().toLowerCase()
  const all = await getPreventivi()

  const items = all
    .filter((p) => (allowedClientIds ? !!p.clientId && allowedClientIds.has(p.clientId) : true))
    .filter((p) => !clientId || p.clientId === clientId)
    .filter((p) => !filters.statuses || filters.statuses.includes(p.status as PreventivoStatus))
    .filter(
      (p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.prospectName ?? '').toLowerCase().includes(q) ||
        (p.client?.name ?? '').toLowerCase().includes(q)
    )
    .map((p) => {
      const computed = p.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      const amount = p.totalAmount ?? (p.items.length > 0 ? computed : null)
      const createdAt = dbDateToDateOnly(p.createdAt)
      return {
        id: p.id,
        title: p.title,
        clientName: p.client?.name ?? p.prospectName ?? null,
        isProspect: !p.clientId,
        status: p.status,
        statusLabel: STATUS_LABEL[p.status] ?? p.status,
        totalAmount: amount,
        createdAt,
        ageDays: diffCalendarDaysLocal(parseDateOnly(createdAt), parseDateOnly(today)),
        type: p.type,
      }
    })

  const byStatus: Record<string, number> = {}
  let totalAmount = 0
  for (const i of items) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
    totalAmount += i.totalAmount ?? 0
  }

  return { ok: true, total: items.length, totalAmount, byStatus, items: items.slice(0, MAX_ITEMS), clientId }
}

const eur = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`

const listPreventivi = defineTool({
  name: 'list_preventivi',
  description: 'Elenca i preventivi (dal più recente). Filtri: stato (Bozza, Inviato, Accettato, Rifiutato), cliente, testo.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'preventivi_read',
  inputSchema: z.object({
    status: z.enum(PREVENTIVO_STATUSES).optional(),
    clientName: z.string().optional(),
    query: z.string().optional().describe('Cerca nel titolo o nel nome cliente/prospect'),
  }),
  execute: async (input, ctx) => {
    const res = await queryPreventivi(ctx, {
      statuses: input.status ? [input.status] : undefined,
      clientName: input.clientName,
      query: input.query,
    })
    if (res.ok === false) return res
    return {
      ok: true,
      summary:
        res.total === 0
          ? 'Nessun preventivo con questi filtri.'
          : `${res.total} preventivi, totale ${eur(res.totalAmount)}.`,
      data: { total: res.total, totalAmount: res.totalAmount, byStatus: res.byStatus, preventivi: res.items },
      href: '/preventivi',
      entityType: 'Preventivo',
      quickLinks: [{ label: 'Apri Preventivi', href: '/preventivi' }],
    }
  },
})

const getPreventiviPending = defineTool({
  name: 'get_preventivi_pending',
  description:
    'Preventivi non ancora accettati: bozze e inviati in attesa di risposta (opzionalmente anche i rifiutati). Mostra da quanti giorni sono fermi.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'preventivi_read',
  inputSchema: z.object({
    clientName: z.string().optional(),
    includeRejected: z.boolean().default(false),
    includeDrafts: z.boolean().default(true),
  }),
  execute: async (input, ctx) => {
    const statuses: PreventivoStatus[] = ['INVIATO']
    if (input.includeDrafts) statuses.push('BOZZA')
    if (input.includeRejected) statuses.push('RIFIUTATO')

    const res = await queryPreventivi(ctx, { statuses, clientName: input.clientName })
    if (res.ok === false) return res
    const items = [...res.items].sort((a, b) => b.ageDays - a.ageDays)

    return {
      ok: true,
      summary:
        res.total === 0
          ? 'Nessun preventivo in attesa.'
          : `${res.total} preventivi non accettati (${eur(res.totalAmount)} in totale).`,
      data: { total: res.total, totalAmount: res.totalAmount, byStatus: res.byStatus, preventivi: items },
      href: '/preventivi',
      entityType: 'Preventivo',
      quickLinks: [{ label: 'Apri Preventivi', href: '/preventivi' }],
    }
  },
})

export const preventiviTools = [listPreventivi, getPreventiviPending]
