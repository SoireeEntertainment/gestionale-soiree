import { unstable_cache } from 'next/cache'
import { prisma } from './prisma'

/** Email degli utenti che possono essere mostrati nel selettore "Guarda PED di..." (e in altre liste PED). */
export const ALLOWED_PED_USER_EMAILS = [
  'alessia@soiree.it',
  'cristian.palazzolo@soiree.it',
  'daniele@soiree.it',
  'davide@soiree.it',
  'enrico@soiree.it',
] as const

/** Ottiene tutti gli utenti attivi (cached 60s per ridurre carico DB su navigazione). */
export async function getUsers() {
  return unstable_cache(
    async () => {
      return prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      })
    },
    ['users-active-list'],
    { revalidate: 60 }
  )()
}

/**
 * Utenti da mostrare nel PED (dropdown "Guarda PED di..."): solo i 5 autorizzati.
 * Agente 1/2 e altri non devono comparire.
 */
export async function getUsersForPed() {
  const all = await getUsers()
  return all.filter((u) => ALLOWED_PED_USER_EMAILS.includes(u.email as (typeof ALLOWED_PED_USER_EMAILS)[number]))
}

/**
 * Ottiene un utente per ID
 */
export async function getUser(id: string) {
  return await prisma.user.findUnique({
    where: { id },
  })
}
