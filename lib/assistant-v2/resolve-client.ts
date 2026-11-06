import { prisma } from '@/lib/prisma'
import type { AssistantAuthContext } from '@/lib/assistant-v2/types'

export type ClientMatch =
  | { status: 'found'; id: string; name: string }
  | { status: 'ambiguous'; choices: { id: string; label: string }[] }
  | { status: 'not_found' }

function clientAccessWhere(auth: AssistantAuthContext) {
  if (auth.permissions.canReadAllClients) return {}
  return {
    OR: [
      { assignedToUserId: auth.currentUserId },
      { assignees: { some: { userId: auth.currentUserId } } },
    ],
  }
}

/** Risolve un cliente per nome senza inventare ID. */
export async function resolveClientByName(
  auth: AssistantAuthContext,
  nameHint: string
): Promise<ClientMatch> {
  const q = nameHint.trim()
  if (!q) return { status: 'not_found' }

  const access = clientAccessWhere(auth)
  const exact = await prisma.client.findMany({
    where: { ...access, name: { equals: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 10,
  })
  if (exact.length === 1) return { status: 'found', id: exact[0].id, name: exact[0].name }
  if (exact.length > 1) {
    return {
      status: 'ambiguous',
      choices: exact.map((c) => ({ id: c.id, label: c.name })),
    }
  }

  const partial = await prisma.client.findMany({
    where: { ...access, name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 8,
  })
  if (partial.length === 0) return { status: 'not_found' }
  if (partial.length === 1) return { status: 'found', id: partial[0].id, name: partial[0].name }
  return {
    status: 'ambiguous',
    choices: partial.map((c) => ({ id: c.id, label: c.name })),
  }
}

export async function assertClientAccess(
  auth: AssistantAuthContext,
  clientId: string
): Promise<{ id: string; name: string } | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      assignedToUserId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!client) return null
  if (auth.permissions.canReadAllClients) return { id: client.id, name: client.name }
  const ok =
    client.assignedToUserId === auth.currentUserId ||
    client.assignees.some((a) => a.userId === auth.currentUserId)
  return ok ? { id: client.id, name: client.name } : null
}
