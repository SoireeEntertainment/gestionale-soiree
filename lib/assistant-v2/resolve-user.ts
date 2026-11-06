import { prisma } from '@/lib/prisma'

export type UserMatch =
  | { status: 'found'; id: string; name: string }
  | { status: 'ambiguous'; choices: { id: string; label: string }[] }
  | { status: 'not_found' }

export async function resolveUserByName(nameHint: string): Promise<UserMatch> {
  const q = nameHint.trim()
  if (!q) return { status: 'not_found' }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
    take: 8,
  })
  if (users.length === 0) return { status: 'not_found' }
  if (users.length === 1) return { status: 'found', id: users[0].id, name: users[0].name }
  const exact = users.filter((u) => u.name.toLowerCase() === q.toLowerCase())
  if (exact.length === 1) return { status: 'found', id: exact[0].id, name: exact[0].name }
  return {
    status: 'ambiguous',
    choices: users.map((u) => ({ id: u.id, label: u.name })),
  }
}
