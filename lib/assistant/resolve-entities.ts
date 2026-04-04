import { prisma } from '@/lib/prisma'

export type ResolvedClient = { id: string; name: string }

/** Cerca clienti per nome (case-insensitive, contains). */
export async function findClientsByNameHint(hint: string): Promise<ResolvedClient[]> {
  const q = hint.trim()
  if (!q) return []
  return prisma.client.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 15,
  })
}

/** Risolve un solo cliente: errore se 0 o >1. */
export async function resolveSingleClient(hint: string): Promise<ResolvedClient | { ambiguous: ResolvedClient[] } | null> {
  const list = await findClientsByNameHint(hint)
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const exact = list.filter((c) => c.name.toLowerCase() === hint.trim().toLowerCase())
  if (exact.length === 1) return exact[0]
  return { ambiguous: list }
}

export async function findCategoryByNameHint(hint: string): Promise<{ id: string; name: string } | null> {
  const q = hint.trim()
  if (!q) return null
  const rows = await prisma.category.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 5,
  })
  if (rows.length === 0) return null
  const exact = rows.find((r) => r.name.toLowerCase() === q.toLowerCase())
  return exact ?? rows[0]
}

export async function findWorksByClientAndTitle(
  clientId: string,
  titleHint: string
): Promise<{ id: string; title: string; clientId: string }[]> {
  const q = titleHint.trim()
  if (!q) return []
  return prisma.work.findMany({
    where: {
      clientId,
      title: { contains: q, mode: 'insensitive' },
    },
    select: { id: true, title: true, clientId: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })
}

/**
 * Risolve lavori per titolo (contains) o, se non c’è match, per nome categoria.
 */
export type ResolvedWork = { id: string; title: string; clientId: string }

export async function findWorksByClientCategoryOrTitle(
  clientId: string,
  workHint: string
): Promise<ResolvedWork[]> {
  const byTitle = await findWorksByClientAndTitle(clientId, workHint)
  if (byTitle.length > 0) return byTitle
  const cat = await findCategoryByNameHint(workHint)
  if (!cat) return []
  return prisma.work.findMany({
    where: { clientId, categoryId: cat.id },
    select: { id: true, title: true, clientId: true },
    orderBy: { updatedAt: 'desc' },
    take: 15,
  })
}

/** Risolve un lavoro per cliente + titolo (parziale) o nome categoria. */
export async function resolveWorkByClientAndCategory(
  clientId: string,
  categoryOrTitleHint: string
): Promise<ResolvedWork | { ambiguous: ResolvedWork[] } | null> {
  const list = await findWorksByClientCategoryOrTitle(clientId, categoryOrTitleHint)
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  return { ambiguous: list }
}

export async function resolveUserByNameHint(hint: string): Promise<{ id: string; name: string } | { ambiguous: { id: string; name: string }[] } | null> {
  const q = hint.trim()
  if (!q) return null
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      name: { contains: q, mode: 'insensitive' },
    },
    select: { id: true, name: true },
    take: 15,
  })
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]
  const exact = rows.filter((u) => u.name.toLowerCase() === q.toLowerCase())
  if (exact.length === 1) return exact[0]
  return { ambiguous: rows }
}

/** Alias espliciti per orchestrator / documentazione. */
export const resolveClientByName = resolveSingleClient
export const resolveUserByName = resolveUserByNameHint
