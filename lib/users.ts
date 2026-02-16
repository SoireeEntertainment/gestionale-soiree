import { prisma } from './prisma'

/**
 * Ottiene tutti gli utenti attivi
 */
export async function getUsers() {
  return await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * Ottiene un utente per ID
 */
export async function getUser(id: string) {
  return await prisma.user.findUnique({
    where: { id },
  })
}
