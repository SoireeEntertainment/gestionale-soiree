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

const CLERK_AUTH_RETRY_MS = 75
const FALLBACK_ADMIN_EMAILS = [
  'davide@soiree.it',
  'cristian.palazzolo@soiree.it',
  'enrico@soiree.it',
  'daniele@soiree.it',
  'alessia@soiree.it',
  'agente1@soiree.studio',
  'agente2@soiree.studio',
]

type ClerkIdentity = {
  userId: string
  email: string | null
  name: string | null
}

type AuthDecisionDebug = {
  clerkUserId: string | null
  email: string | null
  adminEmails: string[]
  isAllowedByAdminEmails: boolean
  foundDbUser: boolean
  finalDecision: 'allow' | 'deny'
  reasonDenied: string | null
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const value = email.trim().toLowerCase()
  return value.length > 0 ? value : null
}

function parseAdminEmailsFromEnv(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,\n;]+/)
    .map((item) => normalizeEmail(item))
    .filter((item): item is string => !!item)
}

function getEmergencyAdminEmails(): string[] {
  const envEmails = parseAdminEmailsFromEnv(process.env.ADMIN_EMAILS)
  const merged = new Set<string>([...envEmails, ...FALLBACK_ADMIN_EMAILS])
  return Array.from(merged)
}

async function getClerkIdentity(userId: string): Promise<ClerkIdentity | null> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await clerkClient.users.getUser(userId)
    const email = normalizeEmail(clerkUser.primaryEmailAddress?.emailAddress ?? null)
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
    const name = fullName || clerkUser.username || null
    return { userId, email, name }
  } catch (e) {
    console.warn('[auth] getClerkIdentity failed', e)
    return { userId, email: null, name: null }
  }
}

async function readClerkUserId(): Promise<string | null> {
  const { auth } = await import('@clerk/nextjs/server')
  const { userId } = await auth()
  return userId ?? null
}

/** Un secondo tentativo dopo breve attesa riduce falsi negativi con richieste RSC/server action ravvicinate. */
async function getClerkAuthUserIdWithRetry(): Promise<string | null> {
  try {
    const first = await readClerkUserId()
    if (first) return first
  } catch (e) {
    console.warn('[getAuthUserId] Clerk auth errore, retry', e)
  }
  await new Promise((r) => setTimeout(r, CLERK_AUTH_RETRY_MS))
  try {
    return await readClerkUserId()
  } catch (e2) {
    console.error('[getAuthUserId] Clerk auth retry fallito', e2)
    return null
  }
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

    return await getClerkAuthUserIdWithRetry()
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
      where: { clerkId: userId },
    })

    if (!user && userId.startsWith(DEV_USER_PREFIX)) {
      const suffix = userId.slice(DEV_USER_PREFIX.length)
      if (suffix.length >= 15) {
        user = await prisma.user.findFirst({ where: { id: suffix } })
      }
    }

    const identity =
      isClerkConfigured && userId && !userId.startsWith(DEV_USER_PREFIX)
        ? await getClerkIdentity(userId)
        : null
    const email = normalizeEmail(identity?.email ?? null)
    const adminEmails = getEmergencyAdminEmails()
    const isAllowedByAdminEmails = !!(email && adminEmails.includes(email))

    if (!user && isClerkConfigured && userId && !userId.startsWith(DEV_USER_PREFIX)) {
      try {
        if (email) {
          user = await prisma.user.findFirst({ where: { email } })
          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { clerkId: userId, isActive: true },
            })
          } else if (isAllowedByAdminEmails) {
            user = await prisma.user.create({
              data: {
                email,
                name: identity?.name || email.split('@')[0] || 'Utente',
                clerkId: userId,
                isActive: true,
              },
            })
          }
        }
      } catch (e) {
        console.warn('[getCurrentUser] Errore risoluzione Clerk→DB:', e)
      }
    }

    if (user && !user.isActive && isAllowedByAdminEmails) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true, clerkId: userId.startsWith(DEV_USER_PREFIX) ? user.clerkId : userId },
      })
    }

    const role = (user as { role?: string }).role
    const userIsValid = !!user && user.isActive && (role === 'ADMIN' || role === 'AGENTE')
    const reasonDenied = !user
      ? 'db_user_not_found'
      : !user.isActive
        ? 'db_user_inactive'
        : role !== 'ADMIN' && role !== 'AGENTE'
          ? 'invalid_role'
          : null

    console.info('[auth-decision]', {
      clerkUserId: userId,
      email,
      ADMIN_EMAILS: adminEmails,
      isAllowedByAdminEmails,
      foundDbUser: !!user,
      reasonDenied: reasonDenied ?? 'none',
    })

    if (!userIsValid || !user) return null

    const resolvedUser = user
    return {
      id: resolvedUser.id,
      userId,
      name: resolvedUser.name,
      email: resolvedUser.email,
      role: role as UserRole,
    }
  } catch (err) {
    console.error('[getCurrentUser]', err)
    return null
  }
}

export async function getAuthDecisionDebug(): Promise<AuthDecisionDebug> {
  const userId = await getAuthUserId()
  if (!userId) {
    const adminEmails = getEmergencyAdminEmails()
    return {
      clerkUserId: null,
      email: null,
      adminEmails,
      isAllowedByAdminEmails: false,
      foundDbUser: false,
      finalDecision: 'deny',
      reasonDenied: 'no_clerk_session',
    }
  }

  const isClerk =
    !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) &&
    !userId.startsWith(DEV_USER_PREFIX)
  const identity = isClerk ? await getClerkIdentity(userId) : null
  const email = normalizeEmail(identity?.email ?? null)
  const adminEmails = getEmergencyAdminEmails()
  const isAllowedByAdminEmails = !!(email && adminEmails.includes(email))
  const found = await prisma.user.findFirst({
    where: {
      OR: [{ clerkId: userId }, ...(email ? [{ email }] : [])],
    },
  })
  const role = (found as { role?: string } | null)?.role
  const currentUser = await getCurrentUser()
  const allowed = !!currentUser
  const reasonDenied = allowed
    ? null
    : !found
      ? 'db_user_not_found'
      : !found.isActive
        ? 'db_user_inactive'
        : role !== 'ADMIN' && role !== 'AGENTE'
          ? 'invalid_role'
          : 'unknown'

  return {
    clerkUserId: userId,
    email,
    adminEmails,
    isAllowedByAdminEmails,
    foundDbUser: !!found,
    finalDecision: allowed ? 'allow' : 'deny',
    reasonDenied,
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
 * Richiede utente loggato: se manca redirect a sign-in; se è in Clerk ma non nel DB (o errore DB) → /non-autorizzato (evita loop).
 */
export async function requireAuth(): Promise<CurrentUser> {
  const toLogin = () => redirect(isClerkConfigured() ? '/sign-in' : '/dev-users')
  try {
    const userId = await getAuthUserId()
    if (!userId) toLogin()
    const user = await getCurrentUser()
    // Autenticato con Clerk ma utente non presente nel DB (o senza ruolo): evita redirect a /sign-in che causerebbe loop
    if (!user) {
      console.warn('[requireAuth] Redirect /non-autorizzato: userId presente ma getCurrentUser() null (contesto:', typeof globalThis !== 'undefined' ? 'server' : 'unknown', ')')
      redirect('/non-autorizzato')
    }
    return user as CurrentUser
  } catch (err) {
    console.error('[requireAuth]', err)
    const userId = await getAuthUserId().catch(() => null)
    if (userId) {
      console.warn('[requireAuth] Redirect /non-autorizzato dopo catch: userId=', userId)
      redirect('/non-autorizzato')
    }
    toLogin()
  }
  throw new Error('Auth failed') // unreachable dopo toLogin()
}

