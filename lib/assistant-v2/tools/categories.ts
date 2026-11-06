import { z } from 'zod'
import { defineTool, resolveClient } from '@/lib/assistant-v2/tools/helpers'
import { prisma } from '@/lib/prisma'

const CLIENT_CATEGORY_STATUS_LABEL: Record<string, string> = {
  NOT_ACTIVE: 'Non attiva',
  ACTIVE: 'Attiva',
  IN_PROGRESS: 'In corso',
  ON_HOLD: 'In pausa',
  COMPLETED: 'Completata',
}

const listCategories = defineTool({
  name: 'list_categories',
  description: 'Elenca le categorie di servizio disponibili (es. Social, Sito web) con il numero di lavori e clienti collegati.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'categories_read',
  inputSchema: z.object({
    query: z.string().optional().describe('Filtro testo sul nome'),
  }),
  execute: async (input) => {
    const q = input.query?.trim()
    const rows = await prisma.category.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { works: true, clientCategories: true } },
      },
      orderBy: { name: 'asc' },
    })
    const categories = rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      worksCount: c._count.works,
      clientsCount: c._count.clientCategories,
    }))
    return {
      ok: true,
      summary: categories.length === 0 ? 'Nessuna categoria trovata.' : `${categories.length} categorie.`,
      data: { categories },
      href: '/categories',
      entityType: 'Category',
    }
  },
})

const listClientCategories = defineTool({
  name: 'list_client_categories',
  description: 'Elenca le categorie di servizio associate a un cliente con il relativo stato (attiva, in corso, in pausa, ...).',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'categories_read',
  inputSchema: z.object({
    clientName: z.string().optional().describe('Nome cliente; se omesso usa il cliente della conversazione'),
  }),
  execute: async (input, ctx) => {
    const client = await resolveClient(ctx, input.clientName)
    if (client.ok === false) return client

    const rows = await prisma.clientCategory.findMany({
      where: { clientId: client.id },
      select: { status: true, notes: true, category: { select: { id: true, name: true } } },
      orderBy: { category: { name: 'asc' } },
    })
    const categories = rows.map((r) => ({
      categoryId: r.category.id,
      name: r.category.name,
      status: r.status,
      statusLabel: CLIENT_CATEGORY_STATUS_LABEL[r.status] ?? r.status,
      notes: r.notes,
    }))
    const active = categories.filter((c) => c.status === 'ACTIVE' || c.status === 'IN_PROGRESS').length

    return {
      ok: true,
      summary:
        categories.length === 0
          ? `${client.name} non ha categorie associate.`
          : `${client.name}: ${categories.length} categorie (${active} attive).`,
      data: { client: { id: client.id, name: client.name }, categories },
      href: `/clients/${client.id}`,
      entityType: 'ClientCategory',
      quickLinks: [{ label: `Apri ${client.name}`, href: `/clients/${client.id}` }],
    }
  },
})

export const categoryTools = [listCategories, listClientCategories]
