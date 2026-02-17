import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from './prisma'

const DEV_USER_PREFIX = 'dev-user-'
export const DEV_COOKIE_NAME = 'dev_user_id'

export type UserRole = 'ADMIN' | 'AGENTE'

export interface CurrentUser {
  id: string
  userId: string // clerkId o mock
  name: string
  email: string
  role: UserRole
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Restituisce l'id Clerk (o mock in dev).
 * In dev, se è presente il cookie dev_user_id, restituisce dev-user-<id> per quel utente.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const isClerkConfigured = !!(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY
    )

    if (!isClerkConfigured) {
      const cookieStore = await cookies()
      const devUserId = cookieStore.get(DEV_COOKIE_NAME)?.value
      // Accetta CUID (25 caratteri) o UUID (36); ammetti anche 15-40 per compatibilità
      if (devUserId && devUserId.length >= 15 && devUserId.length <= 40 && /^[a-zA-Z0-9_-]+$/.test(devUserId))
        return `${DEV_USER_PREFIX}${devUserId}`
      return null
    }

    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    return userId ?? null
  } catch (err) {
    console.error('[getAuthUserId]', err)
    return null
  }
}

/**
 * Restituisce l'utente corrente dal DB con ruolo (per autorizzazioni).
 * Cerca per clerkId; in dev (dev-user-<id> o dev-user-123) risolve l'utente come sotto.
 * Se Clerk è configurato e non c'è match per clerkId, prova a risolvere per email (Clerk → DB).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const userId = await getAuthUserId()
    if (!userId) return null

    const isClerkConfigured = !!(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY
    )

    let user = await prisma.user.findFirst({
      where: { clerkId: userId, isActive: true },
    })

    if (!user && userId.startsWith(DEV_USER_PREFIX)) {
      const suffix = userId.slice(DEV_USER_PREFIX.length)
      if (suffix.length >= 15) {
        user = await prisma.user.findFirst({
          where: { id: suffix, isActive: true },
        })
      }
    }

    if (!user && isClerkConfigured && userId && !userId.startsWith(DEV_USER_PREFIX)) {
      try {
        const { clerkClient } = await import('@clerk/nextjs/server')
        const clerkUser = await clerkClient.users.getUser(userId)
        const email = clerkUser.primaryEmailAddress?.emailAddress
        if (email) {
          user = await prisma.user.findFirst({
            where: { email, isActive: true },
          })
          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: { clerkId: userId },
            })
          }
        }
      } catch {
        // ignora errori Clerk
      }
    }

    const role = (user as { role?: string }).role
    if (!user || (role !== 'ADMIN' && role !== 'AGENTE')) return null

    return {
      id: user.id,
      userId,
      name: user.name,
      email: user.email,
      role: role as UserRole,
    }
  } catch (err) {
    console.error('[getCurrentUser]', err)
    return null
  }
}

/** Solo lettura: Agente può vedere solo clienti e preventivi, senza modificare. */
export function canWrite(user: CurrentUser | null): boolean {
  return user?.role === 'ADMIN'
}

export function isAgente(user: CurrentUser | null): boolean {
  return user?.role === 'AGENTE'
}

// Wrapper per compatibilità con auth() di Clerk
export async function auth() {
  const userId = await getAuthUserId()
  return { userId }
}

const isClerkConfigured = () =>
  !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

/**
 * Richiede utente loggato: se manca redirect a sign-in; se è in Clerk ma non nel DB → /non-autorizzato (evita loop).
 */
export async function requireAuth(): Promise<CurrentUser> {
  const toLogin = () => redirect(isClerkConfigured() ? '/sign-in' : '/dev-users')
  try {
    const userId = await getAuthUserId()
    if (!userId) toLogin()
    const user = await getCurrentUser()
    // Autenticato con Clerk ma utente non presente nel DB (o senza ruolo): evita redirect a /sign-in che causerebbe loop
    if (!user) redirect('/non-autorizzato')
    return user as CurrentUser
  } catch (err) {
    console.error('[requireAuth]', err)
    toLogin()
  }
  throw new Error('Auth failed') // unreachable dopo toLogin()
}

