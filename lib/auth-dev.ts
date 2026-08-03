import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
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

/** Errore temporaneo (DB/rete): non implica logout né “non autorizzato”. */
export class AuthTransientError extends Error {
  readonly code = 'AUTH_TRANSIENT' as const
  constructor(message = 'Servizio temporaneamente non disponibile') {
    super(message)
    this.name = 'AuthTransientError'
  }
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
  finalDecision: 'allow' | 'deny' | 'transient'
  reasonDenied: string | null
}

type DenialReason =
  | 'no_clerk_session'
  | 'missing_email'
  | 'internal_user_not_found'
  | 'duplicate_internal_user'
  | 'clerk_id_mismatch'
  | 'user_disabled'
  | 'invalid_role'
  | 'database_unavailable'
  | 'session_expired'
  | 'middleware_redirect'
  | 'unknown'

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

function isDatabaseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: string; message?: string }
  const msg = (e.message ?? '').toLowerCase()
  return (
    e.name === 'PrismaClientKnownRequestError' ||
    e.name === 'PrismaClientUnknownRequestError' ||
    e.name === 'PrismaClientInitializationError' ||
    e.name === 'PrismaClientRustPanicError' ||
    e.code === 'P1001' ||
    e.code === 'P1002' ||
    e.code === 'P1008' ||
    e.code === 'P1017' ||
    msg.includes('can\'t reach database') ||
    msg.includes('connection') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  )
}

async function logAuthDiagnostic(payload: {
  route?: string
  clerkUserId: string | null
  email: string | null
  internalUserFound: boolean
  internalUserId: string | null
  isActive: boolean | null
  authorizationDecision: 'allow' | 'deny' | 'transient'
  denialReason: DenialReason | null
  sessionPresent: boolean
  databaseError: boolean
  redirectTarget?: string | null
}) {
  console.info('[auth-diagnostic]', {
    timestamp: new Date().toISOString(),
    route: payload.route ?? null,
    clerkUserId: payload.clerkUserId,
    email: payload.email,
    internalUserFound: payload.internalUserFound,
    internalUserId: payload.internalUserId,
    isActive: payload.isActive,
    authorizationDecision: payload.authorizationDecision,
    denialReason: payload.denialReason,
    sessionPresent: payload.sessionPresent,
    databaseError: payload.databaseError,
    redirectTarget: payload.redirectTarget ?? null,
  })
}

async function getRequestPathname(): Promise<string | undefined> {
  try {
    const h = await headers()
    return h.get('x-pathname') ?? h.get('next-url') ?? undefined
  } catch {
    return undefined
  }
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

async function findUsersByEmailInsensitive(email: string) {
  return prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Restituisce l'utente corrente dal DB con ruolo (per autorizzazioni).
 * Cerca per clerkId; in dev (dev-user-<id>) risolve l'utente come sotto.
 * Se Clerk è configurato e non c'è match per clerkId, prova a risolvere per email (Clerk → DB).
 * Gli errori DB temporanei lanciano AuthTransientError (non “non autorizzato”).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const route = await getRequestPathname()
  let clerkUserId: string | null = null
  let email: string | null = null

  try {
    const userId = await getAuthUserId()
    clerkUserId = userId
    if (!userId) {
      await logAuthDiagnostic({
        route,
        clerkUserId: null,
        email: null,
        internalUserFound: false,
        internalUserId: null,
        isActive: null,
        authorizationDecision: 'deny',
        denialReason: 'no_clerk_session',
        sessionPresent: false,
        databaseError: false,
      })
      return null
    }

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
    email = normalizeEmail(identity?.email ?? null)
    const adminEmails = getEmergencyAdminEmails()
    const isAllowedByAdminEmails = !!(email && adminEmails.includes(email))

    if (!user && isClerkConfigured && userId && !userId.startsWith(DEV_USER_PREFIX)) {
      if (!email) {
        await logAuthDiagnostic({
          route,
          clerkUserId: userId,
          email: null,
          internalUserFound: false,
          internalUserId: null,
          isActive: null,
          authorizationDecision: 'deny',
          denialReason: 'missing_email',
          sessionPresent: true,
          databaseError: false,
          redirectTarget: '/non-autorizzato',
        })
        return null
      }

      try {
        const matches = await findUsersByEmailInsensitive(email)
        if (matches.length > 1) {
          console.warn('[getCurrentUser] duplicate_internal_user', {
            email,
            ids: matches.map((m) => m.id),
            chosenHint: 'prefer clerkId match, else oldest active',
          })
          await logAuthDiagnostic({
            route,
            clerkUserId: userId,
            email,
            internalUserFound: true,
            internalUserId: matches[0]?.id ?? null,
            isActive: matches[0]?.isActive ?? null,
            authorizationDecision: 'allow',
            denialReason: 'duplicate_internal_user',
            sessionPresent: true,
            databaseError: false,
          })
          // Non bloccare: collega il record corretto senza creare duplicati.
          user =
            matches.find((m) => m.clerkId === userId) ??
            matches.find((m) => !m.clerkId && m.isActive) ??
            matches.find((m) => m.isActive) ??
            matches[0]
        } else if (matches.length === 1) {
          user = matches[0]
        }

        if (user) {
          if (user.clerkId && user.clerkId !== userId) {
            // Record già legato a un altro account Clerk: non sovrascrivere.
            await logAuthDiagnostic({
              route,
              clerkUserId: userId,
              email,
              internalUserFound: true,
              internalUserId: user.id,
              isActive: user.isActive,
              authorizationDecision: 'deny',
              denialReason: 'clerk_id_mismatch',
              sessionPresent: true,
              databaseError: false,
              redirectTarget: '/non-autorizzato',
            })
            return null
          }
          if (!user.clerkId || !user.isActive) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { clerkId: userId, isActive: true },
            })
          }
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
      } catch (e) {
        if (isDatabaseError(e)) throw new AuthTransientError()
        console.warn('[getCurrentUser] Errore risoluzione Clerk→DB:', e)
      }
    }

    if (user && !user.isActive && isAllowedByAdminEmails) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true, clerkId: userId.startsWith(DEV_USER_PREFIX) ? user.clerkId : userId },
      })
    }

    const role = (user as { role?: string } | null)?.role
    const userIsValid = !!user && user.isActive && (role === 'ADMIN' || role === 'AGENTE')
    const denialReason: DenialReason | null = !user
      ? 'internal_user_not_found'
      : !user.isActive
        ? 'user_disabled'
        : role !== 'ADMIN' && role !== 'AGENTE'
          ? 'invalid_role'
          : null

    await logAuthDiagnostic({
      route,
      clerkUserId: userId,
      email: email ?? normalizeEmail(user?.email) ?? null,
      internalUserFound: !!user,
      internalUserId: user?.id ?? null,
      isActive: user?.isActive ?? null,
      authorizationDecision: userIsValid ? 'allow' : 'deny',
      denialReason,
      sessionPresent: true,
      databaseError: false,
      redirectTarget: userIsValid ? null : '/non-autorizzato',
    })

    console.info('[auth-decision]', {
      clerkUserId: userId,
      email,
      ADMIN_EMAILS: adminEmails,
      isAllowedByAdminEmails,
      foundDbUser: !!user,
      reasonDenied: denialReason ?? 'none',
    })

    if (!userIsValid || !user) return null

    return {
      id: user.id,
      userId,
      name: user.name,
      email: user.email,
      role: role as UserRole,
    }
  } catch (err) {
    if (err instanceof AuthTransientError) {
      await logAuthDiagnostic({
        route,
        clerkUserId,
        email,
        internalUserFound: false,
        internalUserId: null,
        isActive: null,
        authorizationDecision: 'transient',
        denialReason: 'database_unavailable',
        sessionPresent: !!clerkUserId,
        databaseError: true,
        redirectTarget: '/errore-temporaneo',
      })
      throw err
    }
    if (isDatabaseError(err)) {
      await logAuthDiagnostic({
        route,
        clerkUserId,
        email,
        internalUserFound: false,
        internalUserId: null,
        isActive: null,
        authorizationDecision: 'transient',
        denialReason: 'database_unavailable',
        sessionPresent: !!clerkUserId,
        databaseError: true,
        redirectTarget: '/errore-temporaneo',
      })
      throw new AuthTransientError()
    }
    console.error('[getCurrentUser]', err)
    await logAuthDiagnostic({
      route,
      clerkUserId,
      email,
      internalUserFound: false,
      internalUserId: null,
      isActive: null,
      authorizationDecision: 'deny',
      denialReason: 'unknown',
      sessionPresent: !!clerkUserId,
      databaseError: false,
      redirectTarget: '/non-autorizzato',
    })
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

  let found = null as Awaited<ReturnType<typeof prisma.user.findFirst>>
  try {
    found = await prisma.user.findFirst({
      where: {
        OR: [
          { clerkId: userId },
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
    })
  } catch {
    return {
      clerkUserId: userId,
      email,
      adminEmails,
      isAllowedByAdminEmails,
      foundDbUser: false,
      finalDecision: 'transient',
      reasonDenied: 'database_unavailable',
    }
  }

  const role = (found as { role?: string } | null)?.role
  let currentUser: CurrentUser | null = null
  try {
    currentUser = await getCurrentUser()
  } catch (e) {
    if (e instanceof AuthTransientError) {
      return {
        clerkUserId: userId,
        email,
        adminEmails,
        isAllowedByAdminEmails,
        foundDbUser: !!found,
        finalDecision: 'transient',
        reasonDenied: 'database_unavailable',
      }
    }
  }
  const allowed = !!currentUser
  const reasonDenied = allowed
    ? null
    : !found
      ? 'internal_user_not_found'
      : !found.isActive
        ? 'user_disabled'
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
 * Richiede utente loggato.
 * - Nessuna sessione → /sign-in
 * - Sessione ok ma non abilitato → /non-autorizzato
 * - Errore DB temporaneo → /errore-temporaneo (sessione Clerk intatta)
 */
export async function requireAuth(): Promise<CurrentUser> {
  const toLogin = () => redirect(isClerkConfigured() ? '/sign-in' : '/dev-users')
  try {
    const userId = await getAuthUserId()
    if (!userId) toLogin()
    const user = await getCurrentUser()
    if (!user) {
      console.warn('[requireAuth] Redirect /non-autorizzato: sessione presente ma utente app non autorizzato')
      redirect('/non-autorizzato')
    }
    return user as CurrentUser
  } catch (err) {
    if (isRedirectError(err)) throw err
    if (err instanceof AuthTransientError || isDatabaseError(err)) {
      console.warn('[requireAuth] Errore temporaneo, redirect /errore-temporaneo')
      redirect('/errore-temporaneo')
    }
    console.error('[requireAuth]', err)
    const userId = await getAuthUserId().catch(() => null)
    if (userId) {
      console.warn('[requireAuth] Redirect /non-autorizzato dopo errore inatteso: userId=', userId)
      redirect('/non-autorizzato')
    }
    toLogin()
  }
  throw new Error('Auth failed')
}
