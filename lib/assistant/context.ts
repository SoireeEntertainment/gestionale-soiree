import { prisma } from '@/lib/prisma'

export type AssistantLlmContext = {
  clients: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  users: { id: string; name: string }[]
}

const MAX_CLIENTS = 250
const MAX_CATEGORIES = 100

/** Contesto compatto per il prompt (niente dati sensibili). */
export async function buildAssistantLlmContext(): Promise<AssistantLlmContext> {
  const [clients, categories, users] = await Promise.all([
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: MAX_CLIENTS,
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: MAX_CATEGORIES,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { clients, categories, users }
}
