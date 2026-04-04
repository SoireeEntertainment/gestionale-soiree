/**
 * Strumenti di ricerca interni (lettura DB) usati dall’LLM o dal layer read.
 */

import { prisma } from '@/lib/prisma'

export type ToolName =
  | 'search_clients'
  | 'search_works'
  | 'search_credentials'
  | 'search_renewals'
  | 'search_ped_tasks'

export async function runAssistantTool(name: ToolName, args: Record<string, unknown>): Promise<string> {
  const q = typeof args.query === 'string' ? args.query.trim() : ''
  const limit = Math.min(20, Math.max(1, Number(args.limit) || 12))

  switch (name) {
    case 'search_clients': {
      if (!q) return 'Parametro query mancante.'
      const rows = await prisma.client.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: limit,
        orderBy: { name: 'asc' },
      })
      if (rows.length === 0) return `Nessun cliente per "${q}".`
      return `Clienti (${rows.length}):\n${rows.map((r) => `- ${r.name} (${r.id})`).join('\n')}`
    }
    case 'search_works': {
      const rows = await prisma.work.findMany({
        where: q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { client: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        select: {
          id: true,
          title: true,
          status: true,
          client: { select: { name: true } },
          category: { select: { name: true } },
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      })
      if (rows.length === 0) return q ? `Nessun lavoro per "${q}".` : 'Nessun lavoro trovato.'
      return `Lavori (${rows.length}):\n${rows
        .map((w) => `- ${w.client.name} · ${w.title} [${w.category.name}] · ${w.status}`)
        .join('\n')}`
    }
    case 'search_credentials': {
      const rows = await prisma.clientCredential.findMany({
        where: q
          ? {
              OR: [
                { label: { contains: q, mode: 'insensitive' } },
                { client: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        select: { id: true, label: true, client: { select: { name: true } } },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      })
      if (rows.length === 0) return q ? `Nessuna credenziale per "${q}".` : 'Nessuna credenziale.'
      return `Credenziali (solo etichetta/cliente — password non esposta):\n${rows
        .map((r) => `- ${r.client.name} · ${r.label}`)
        .join('\n')}`
    }
    case 'search_renewals': {
      const rows = await prisma.clientRenewal.findMany({
        where: q
          ? {
              OR: [
                { serviceName: { contains: q, mode: 'insensitive' } },
                { client: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        select: {
          serviceName: true,
          renewalDate: true,
          status: true,
          client: { select: { name: true } },
        },
        take: limit,
        orderBy: { renewalDate: 'asc' },
      })
      if (rows.length === 0) return q ? `Nessun rinnovo per "${q}".` : 'Nessun rinnovo.'
      return `Rinnovi (${rows.length}):\n${rows
        .map((r) => `- ${r.client.name} · ${r.serviceName} · ${r.renewalDate.toISOString().slice(0, 10)} (${r.status})`)
        .join('\n')}`
    }
    case 'search_ped_tasks': {
      const rows = await prisma.pedItem.findMany({
        where: q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { client: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        select: {
          date: true,
          title: true,
          status: true,
          label: true,
          client: { select: { name: true } },
        },
        take: limit,
        orderBy: { date: 'desc' },
      })
      if (rows.length === 0) return q ? `Nessuna task PED per "${q}".` : 'Nessuna task PED.'
      return `Task PED (${rows.length}):\n${rows
        .map((r) => `- ${r.date.toISOString().slice(0, 10)} · ${r.client.name} · ${r.title} (${r.label ?? r.status})`)
        .join('\n')}`
    }
    default:
      return 'Strumento sconosciuto.'
  }
}
