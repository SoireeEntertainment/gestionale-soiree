import { z } from 'zod'
import { createClientRenewal, getClientRenewals } from '@/app/actions/client-renewals'
import { addDaysLocal, dbDateToDateOnly, formatDateOnly, parseDateOnly } from '@/lib/timeline-dates'
import { formatDateItFromYmd, todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import {
  MAX_ITEMS,
  clientAccessFilter,
  defineTool,
  queueWrite,
  resolveClient,
  resolveDate,
} from '@/lib/assistant-v2/tools/helpers'
import { normalizeDomainInput, resolveRenewalDomain, serviceNameSuggestsDomain } from '@/lib/domain-renewal-utils'
import { prisma } from '@/lib/prisma'
import { RENEWAL_STATUSES } from '@/lib/validations'

const STATUS_LABEL: Record<string, string> = {
  DA_FARE: 'Da fare',
  IN_CORSO: 'In corso',
  COMPLETATO: 'Completato',
  ANNULLATO: 'Annullato',
}

const DOMAIN_PREFIX = 'Dominio: '

function serialize(
  r: {
    id: string
    serviceName: string
    domain: string | null
    renewalDate: Date
    billingDate: Date | null
    status?: string | null
    notes: string | null
  },
  today: string
) {
  const renewalDate = dbDateToDateOnly(r.renewalDate)
  const status = r.status ?? 'DA_FARE'
  return {
    id: r.id,
    serviceName: r.serviceName,
    domain: resolveRenewalDomain({ domain: r.domain, serviceName: r.serviceName }),
    renewalDate,
    billingDate: r.billingDate ? dbDateToDateOnly(r.billingDate) : null,
    status,
    statusLabel: STATUS_LABEL[status] ?? status,
    isOverdue: renewalDate < today && status !== 'COMPLETATO' && status !== 'ANNULLATO',
    notes: r.notes,
  }
}

/* ------------------------------- LETTURE --------------------------------- */

const listUpcomingRenewals = defineTool({
  name: 'list_upcoming_renewals',
  description:
    'Elenca i rinnovi/scadenze (domini, hosting, servizi) in arrivo nei prossimi N giorni, incluse quelle già scadute non completate. Opzionale filtro cliente.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'renewals_read',
  inputSchema: z.object({
    days: z.number().int().min(1).max(365).default(30).describe('Orizzonte in giorni'),
    clientName: z.string().optional(),
    includeOverdue: z.boolean().default(true),
    onlyDomains: z.boolean().optional(),
  }),
  execute: async (input, ctx) => {
    let clientId: string | undefined
    if (input.clientName?.trim()) {
      const c = await resolveClient(ctx, input.clientName, { useMemory: false })
      if (c.ok === false) return c
      clientId = c.id
    }

    const today = todayDateOnlyRome()
    const end = formatDateOnly(addDaysLocal(parseDateOnly(today), input.days))
    const startDate = input.includeOverdue ? undefined : new Date(`${today}T00:00:00.000Z`)

    const rows = await prisma.clientRenewal.findMany({
      where: {
        status: { notIn: ['COMPLETATO', 'ANNULLATO'] },
        renewalDate: { ...(startDate ? { gte: startDate } : {}), lte: new Date(`${end}T23:59:59.999Z`) },
        client: { AND: [clientAccessFilter(ctx.auth), clientId ? { id: clientId } : {}] },
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { renewalDate: 'asc' },
    })

    let renewals = rows.map((r) => ({ ...serialize(r, today), clientName: r.client.name, clientId: r.client.id }))
    if (input.onlyDomains) renewals = renewals.filter((r) => !!r.domain)
    const overdue = renewals.filter((r) => r.isOverdue).length

    return {
      ok: true,
      summary:
        renewals.length === 0
          ? `Nessun rinnovo nei prossimi ${input.days} giorni.`
          : `${renewals.length} rinnovi entro ${formatDateItFromYmd(end)}${overdue ? `, di cui ${overdue} già scaduti` : ''}.`,
      data: { until: end, total: renewals.length, overdue, renewals: renewals.slice(0, MAX_ITEMS) },
      href: '/clients',
      entityType: 'ClientRenewal',
    }
  },
})

const listClientRenewals = defineTool({
  name: 'list_client_renewals',
  description: 'Elenca tutti i rinnovi/scadenze di un cliente (domini, hosting, servizi).',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'renewals_read',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Nome cliente; se omesso usa il cliente della conversazione'),
    includeClosed: z.boolean().default(false).describe('true = include completati/annullati'),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName)
    if (client.ok === false) return client

    const rows = await getClientRenewals(client.id)
    const today = todayDateOnlyRome()
    const renewals = rows
      .map((r) => serialize(r, today))
      .filter((r) => input.includeClosed || (r.status !== 'COMPLETATO' && r.status !== 'ANNULLATO'))
      .slice(0, MAX_ITEMS)

    return {
      ok: true,
      summary:
        renewals.length === 0
          ? `Nessun rinnovo${input.includeClosed ? '' : ' aperto'} per ${client.name}.`
          : `${client.name}: ${renewals.length} rinnovi.`,
      data: { client: { id: client.id, name: client.name }, renewals },
      href: `/clients/${client.id}`,
      entityType: 'ClientRenewal',
      quickLinks: [{ label: `Apri ${client.name}`, href: `/clients/${client.id}` }],
    }
  },
})

/* ------------------------------- SCRITTURE ------------------------------- */

type CreateRenewalPayload = {
  clientId: string
  data: {
    serviceName: string
    domain: string | null
    renewalDate: string
    billingDate: string | null
    status: (typeof RENEWAL_STATUSES)[number]
    notes: string | null
  }
}

const createRenewal = defineTool({
  name: 'create_renewal',
  description:
    'Crea un rinnovo/scadenza per un cliente (richiede conferma). Per il servizio "Dominio" il dominio è OBBLIGATORIO (es. esempio.it).',
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'renewals_write',
  inputSchema: z.object({
    clientName: z.string().describe('Nome cliente (mai ID)'),
    serviceName: z.string().min(1).max(200).describe('es. Dominio, Hosting, Manutenzione sito'),
    domain: z.string().optional().nullable().describe('Obbligatorio se il servizio è Dominio'),
    renewalDatePhrase: z.string().describe('Data di rinnovo, es. 15 gennaio 2027'),
    billingDatePhrase: z.string().optional().nullable().describe('Data di fatturazione, opzionale'),
    status: z.enum(RENEWAL_STATUSES).default('DA_FARE'),
    notes: z.string().optional().nullable(),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (client.ok === false) return client

    let serviceName = input.serviceName.trim()
    const rawDomain = input.domain?.trim() || ''
    const domain = rawDomain ? normalizeDomainInput(rawDomain) : null
    if (rawDomain && !domain) {
      return { ok: false, error: `"${rawDomain}" non è un dominio valido. Indica ad esempio esempio.it.`, clarify: true }
    }
    if (serviceNameSuggestsDomain(serviceName) && !domain) {
      return { ok: false, error: 'Per un rinnovo Dominio serve il nome del dominio (es. esempio.it). Qual è?', clarify: true }
    }
    // Il vincolo unico (cliente + nome servizio) richiede un nome distinto per ogni dominio.
    if (domain && /^dominio$/i.test(serviceName)) serviceName = `${DOMAIN_PREFIX}${domain}`

    const renewal = resolveDate(input.renewalDatePhrase)
    if (renewal.ok === false) return renewal
    let billingDate: string | null = null
    if (input.billingDatePhrase?.trim()) {
      const b = resolveDate(input.billingDatePhrase)
      if (b.ok === false) return b
      billingDate = b.date
    }

    const existing = await prisma.clientRenewal.findFirst({
      where: { clientId: client.id, serviceName },
      select: { id: true },
    })
    if (existing) {
      return { ok: false, error: `${client.name} ha già un rinnovo chiamato «${serviceName}».`, clarify: true }
    }

    const payload: CreateRenewalPayload = {
      clientId: client.id,
      data: {
        serviceName,
        domain,
        renewalDate: renewal.date,
        billingDate,
        status: input.status,
        notes: input.notes?.trim() || null,
      },
    }

    return queueWrite(ctx, 'create_renewal', payload, {
      title: 'Crea rinnovo',
      summary: `${serviceName} — ${client.name}`,
      fields: [
        { label: 'Cliente', value: client.name },
        { label: 'Servizio', value: serviceName },
        ...(domain ? [{ label: 'Dominio', value: domain }] : []),
        { label: 'Data rinnovo', value: formatDateItFromYmd(renewal.date) },
        ...(billingDate ? [{ label: 'Data fatturazione', value: formatDateItFromYmd(billingDate) }] : []),
        { label: 'Stato', value: STATUS_LABEL[input.status] ?? input.status },
      ],
      href: `/clients/${client.id}`,
      entityType: 'ClientRenewal',
      risk: 'medium',
    })
  },
  commit: async (payload: CreateRenewalPayload) => {
    const res = await createClientRenewal(payload.clientId, payload.data)
    return {
      ok: true,
      summary: `Rinnovo creato: «${payload.data.serviceName}» (${formatDateItFromYmd(payload.data.renewalDate)}).`,
      entityType: 'ClientRenewal',
      entityId: res.id,
      href: `/clients/${payload.clientId}`,
    }
  },
})

export const renewalTools = [listUpcomingRenewals, listClientRenewals, createRenewal]
