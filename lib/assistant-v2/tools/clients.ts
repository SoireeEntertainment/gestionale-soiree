import { z } from 'zod'
import { createClient } from '@/app/actions/clients'
import {
  MAX_ITEMS,
  clientAccessFilter,
  defineTool,
  queueWrite,
  resolveClient,
  resolveUser,
} from '@/lib/assistant-v2/tools/helpers'
import { prisma } from '@/lib/prisma'

function normalizeUrl(raw?: string | null): string {
  const s = raw?.trim() ?? ''
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

const searchClients = defineTool({
  name: 'search_clients',
  description:
    'Cerca clienti per nome, referente o email. Restituisce solo clienti accessibili all’utente (ADMIN: tutti; AGENTE: assegnati).',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'clients_read',
  inputSchema: z.object({
    query: z.string().optional().describe('Testo da cercare (nome cliente, referente, email). Vuoto = elenco alfabetico'),
    limit: z.number().int().min(1).max(MAX_ITEMS).optional(),
  }),
  execute: async (input, ctx) => {
    const q = input.query?.trim()
    const rows = await prisma.client.findMany({
      where: {
        AND: [
          clientAccessFilter(ctx.auth),
          q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { contactName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      select: {
        id: true,
        name: true,
        contactName: true,
        industryCategory: true,
        assignedTo: { select: { name: true } },
        assignees: { select: { user: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
      take: input.limit ?? 20,
    })

    const clients = rows.map((c) => {
      const names = new Set<string>()
      if (c.assignedTo) names.add(c.assignedTo.name)
      for (const a of c.assignees) names.add(a.user.name)
      return {
        id: c.id,
        name: c.name,
        contactName: c.contactName,
        industryCategory: c.industryCategory,
        assignees: [...names],
      }
    })

    return {
      ok: true,
      summary: clients.length === 0 ? 'Nessun cliente trovato.' : `Trovati ${clients.length} clienti.`,
      data: { clients },
      href: '/clients',
      entityType: 'Client',
      quickLinks: clients.slice(0, 5).map((c) => ({ label: c.name, href: `/clients/${c.id}` })),
    }
  },
})

const getClientCard = defineTool({
  name: 'get_client_card',
  description:
    'Scheda cliente: anagrafica base, assegnatari, riepilogo categorie e conteggi (preventivi, rinnovi, shooting; lavori/PED solo per admin). Non espone credenziali.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'clients_read',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Nome cliente; se omesso usa il cliente della conversazione'),
  }),
  execute: async (input, ctx) => {
    const resolved = await resolveClient(ctx, input.clientName)
    if (resolved.ok === false) return resolved

    const client = await prisma.client.findUnique({
      where: { id: resolved.id },
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        websiteUrl: true,
        industryCategory: true,
        notes: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
        assignees: { select: { role: true, user: { select: { name: true } } } },
        clientCategories: {
          select: { status: true, category: { select: { name: true } } },
          orderBy: { category: { name: 'asc' } },
        },
        _count: { select: { preventivi: true, renewals: true, shootings: true } },
      },
    })
    if (!client) return { ok: false, error: 'Cliente non trovato.' }

    const isAdmin = ctx.auth.role === 'ADMIN'
    const [activeWorks, pedItems] = isAdmin
      ? await Promise.all([
          prisma.work.count({
            where: { clientId: client.id, status: { notIn: ['DONE', 'CANCELED'] } },
          }),
          prisma.pedItem.count({ where: { clientId: client.id } }),
        ])
      : [null, null]

    const assignees = new Map<string, string>()
    if (client.assignedTo) assignees.set(client.assignedTo.name, 'OWNER')
    for (const a of client.assignees) assignees.set(a.user.name, a.role)

    const categoriesByStatus: Record<string, number> = {}
    for (const cc of client.clientCategories) {
      categoriesByStatus[cc.status] = (categoriesByStatus[cc.status] ?? 0) + 1
    }

    const data = {
      id: client.id,
      name: client.name,
      contactName: client.contactName,
      email: client.email,
      phone: client.phone,
      websiteUrl: client.websiteUrl,
      industryCategory: client.industryCategory,
      notes: client.notes,
      assignees: [...assignees.entries()].map(([name, role]) => ({ name, role })),
      categories: {
        total: client.clientCategories.length,
        byStatus: categoriesByStatus,
        items: client.clientCategories.map((cc) => ({ name: cc.category.name, status: cc.status })),
      },
      counts: {
        preventivi: client._count.preventivi,
        renewals: client._count.renewals,
        shootings: client._count.shootings,
        ...(isAdmin ? { activeWorks, pedItems } : {}),
      },
    }

    return {
      ok: true,
      summary: `Scheda di ${client.name}: ${data.categories.total} categorie, ${client._count.preventivi} preventivi, ${client._count.renewals} rinnovi.`,
      data,
      href: `/clients/${client.id}`,
      entityType: 'Client',
      entityId: client.id,
      quickLinks: [{ label: `Apri ${client.name}`, href: `/clients/${client.id}` }],
    }
  },
})

type CreateClientPayload = {
  name: string
  contactName?: string
  email?: string
  phone?: string
  notes?: string
  websiteUrl: string
  industryCategory: string | null
  assignedToUserId: string | null
}

const createClientTool = defineTool({
  name: 'create_client',
  description:
    'Crea un nuovo cliente in anagrafica (richiede conferma). Controlla i duplicati per nome. Non impostare password o credenziali.',
  kind: 'write',
  risk: 'medium',
  requiresConfirmation: true,
  permission: 'clients_write',
  inputSchema: z.object({
    name: z.string().min(1).max(200),
    contactName: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    websiteUrl: z.string().optional().nullable(),
    industryCategory: z.string().optional().nullable().describe('es. Food, Wellness, Altro'),
    notes: z.string().optional().nullable(),
    assignedUserName: z.string().optional().nullable().describe('Nome del responsabile principale'),
  }),
  execute: async (input, ctx) => {
    const name = input.name.trim()

    const dup = await prisma.client.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { name: true },
    })
    if (dup) {
      return { ok: false, error: `Esiste già un cliente chiamato "${dup.name}".`, clarify: true }
    }

    let assignedToUserId: string | null = null
    let assignedLabel = 'nessuno'
    if (input.assignedUserName?.trim()) {
      const user = await resolveUser(input.assignedUserName)
      if (user.ok === false) return user
      assignedToUserId = user.id
      assignedLabel = user.name
    }

    const websiteUrl = normalizeUrl(input.websiteUrl)
    const payload: CreateClientPayload = {
      name,
      contactName: input.contactName?.trim() || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      websiteUrl,
      industryCategory: input.industryCategory?.trim() || null,
      assignedToUserId,
    }

    const fields = [
      { label: 'Nome', value: name },
      ...(payload.contactName ? [{ label: 'Referente', value: payload.contactName }] : []),
      ...(payload.email ? [{ label: 'Email', value: payload.email }] : []),
      ...(payload.phone ? [{ label: 'Telefono', value: payload.phone }] : []),
      ...(websiteUrl ? [{ label: 'Sito', value: websiteUrl }] : []),
      ...(payload.industryCategory ? [{ label: 'Settore', value: payload.industryCategory }] : []),
      { label: 'Responsabile', value: assignedLabel },
    ]

    return queueWrite(ctx, 'create_client', payload, {
      title: 'Crea cliente',
      summary: name,
      fields,
      href: '/clients',
      entityType: 'Client',
      risk: 'medium',
    })
  },
  commit: async (payload: CreateClientPayload) => {
    const res = await createClient(payload)
    return {
      ok: true,
      summary: `Cliente creato: «${res.client.name}».`,
      entityType: 'Client',
      entityId: res.client.id,
      href: `/clients/${res.client.id}`,
      data: { id: res.client.id, name: res.client.name },
      quickLinks: [{ label: `Apri ${res.client.name}`, href: `/clients/${res.client.id}` }],
    }
  },
})

export const clientTools = [searchClients, getClientCard, createClientTool]
