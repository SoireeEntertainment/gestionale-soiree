import { cache } from 'react'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { prisma } from './prisma'
import {
  AUTH_RECOVERY_PATH,
  classifyClerkBackendFailure,
  classifyProviderSession,
  clerkThrownCode,
  isAuthorizedAppUser,
  isDatabaseError,
  isTimeoutError,
  logAuthEvent,
  readAuthReason,
  safeInternalPath,
  sanitizeRequestId,
  sanitizeRoute,
  type AuthLogEvent,
} from './auth-classification'

const DEV_USER_PREFIX = 'dev-user-'
export const DEV_COOKIE_NAME = 'dev_user_id'

export type UserRole = 'ADMIN' | 'AGENTE'

export interface CurrentUser {
  id: string
  userId: string
  name: string
  email: string
  role: UserRole
}

/** Errore temporaneo (DB/rete/Clerk): non implica logout né “non autorizzato”. */
export class AuthTransientError extends Error {
  readonly code = 'AUTH_TRANSIENT' as const
  readonly source: 'database' | 'provider'
  constructor(message?: string, source: 'database' | 'provider' = 'provider') {
    super(message || 'Servizio temporaneamente non disponibile')
    this.name = 'AuthTransientError'
    this.source = source
  }
}

const CLERK_AUTH_RETRY_MS = 75
const CLERK_BACKEND_TIMEOUT_MS = 4000
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
  | 'clerk_user_not_found'
  | 'user_disabled'
  | 'invalid_role'
  | 'database_unavailable'
  | 'unknown'

type RequestSession =
  | { state: 'authenticated'; userId: string; durationMs: number }
  | { state: 'anonymous'; event: AuthLogEvent; code: string; durationMs: number }
  | { state: 'recover'; code: string; durationMs: number }
  | { state: 'transient'; event: AuthLogEvent; code: string; durationMs: number }

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

const isClerkConfigured = () =>
  !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)

async function getRequestMeta(): Promise<{ route: string | null; requestId: string | null }> {
  try {
    const h = await headers()
    return {
      route: sanitizeRoute(h.get('x-pathname') ?? h.get('next-url') ?? h.get('x-invoke-path')),
      requestId: sanitizeRequestId(h.get('x-vercel-id') ?? h.get('x-request-id')),
    }
  } catch {
    return { route: null, requestId: null }
  }
}

async function readDevUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_COOKIE_NAME)?.value
  if (devUserId && devUserId.length >= 15 && devUserId.length <= 40 && /^[a-zA-Z0-9_-]+$/.test(devUserId)) {
    return `${DEV_USER_PREFIX}${devUserId}`
  }
  return null
}

/**
 * Una sola lettura Clerk per richiesta.
 * Un'eccezione ritentata una volta resta un errore temporaneo: non diventa userId null.
 * userId null senza eccezione è una decisione completata da Clerk e viene classificata.
 */
const getRequestSession = cache(async (): Promise<RequestSession> => {
  const started = Date.now()
  if (!isClerkConfigured()) {
    const devUserId = await readDevUserId()
    const durationMs = Date.now() - started
    if (devUserId) return { state: 'authenticated', userId: devUserId, durationMs }
    return { state: 'anonymous', event: 'AUTH_SESSION_MISSING', code: 'dev_session_missing', durationMs }
  }

  const { auth } = await import('@clerk/nextjs/server')
  let state: Awaited<ReturnType<typeof auth>> | null = null
  let thrown: unknown = null
  try {
    state = await auth()
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, CLERK_AUTH_RETRY_MS))
    try {
      state = await auth()
    } catch (second) {
      thrown = second ?? first
    }
  }

  const durationMs = Date.now() - started
  if (thrown || !state) {
    return {
      state: 'transient',
      event: 'AUTH_PROVIDER_TRANSIENT_ERROR',
      code: clerkThrownCode(thrown),
      durationMs,
    }
  }

  const decision = classifyProviderSession({
    userId: state.userId ?? null,
    reason: state.userId ? null : readAuthReason(state),
    thrown: false,
    recoveryAttempted: false,
  })
  if (decision.kind === 'authenticated') {
    return { state: 'authenticated', userId: state.userId as string, durationMs }
  }
  if (decision.kind === 'recover') return { state: 'recover', code: decision.code, durationMs }
  if (decision.kind === 'temporary') {
    return { state: 'transient', event: decision.event, code: decision.code, durationMs }
  }
  return { state: 'anonymous', event: decision.event, code: decision.code, durationMs }
})

/**
 * Id Clerk verificato, oppure null se Clerk conferma che non c'è una sessione.
 * Gli errori tecnici lanciano AuthTransientError e non sembrano un logout.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getRequestSession()
  if (session.state === 'authenticated') return session.userId
  if (session.state === 'transient') throw new AuthTransientError()
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/**
 * Backend API solo se non esiste già un utente interno collegato a questo clerkId.
 * Un timeout, un 429 o un 5xx non diventano “utente non abilitato”.
 */
async function getClerkIdentity(userId: string): Promise<ClerkIdentity | 'not_found'> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await withTimeout(clerkClient.users.getUser(userId), CLERK_BACKEND_TIMEOUT_MS)
    const email = normalizeEmail(clerkUser.primaryEmailAddress?.emailAddress ?? null)
    const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
    const name = fullName || clerkUser.username || null
    return { userId, email, name }
  } catch (error) {
    if (isTimeoutError(error)) throw new AuthTransientError()
    const failure = classifyClerkBackendFailure(error)
    if (failure === 'not_found') return 'not_found'
    throw new AuthTransientError()
  }
}

async function findUsersByEmailInsensitive(email: string) {
  return prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Utente corrente dal DB. La sessione Clerk è risolta una volta per richiesta.
 * Gli errori DB o della Backend API temporanei lanciano AuthTransientError.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const meta = await getRequestMeta()
  const started = Date.now()
  let sessionState: RequestSession['state'] | null = null

  try {
    const session = await getRequestSession()
    sessionState = session.state
    if (session.state === 'transient') {
      logAuthEvent({
        event: session.event,
        route: meta.route,
        code: session.code,
        requestId: meta.requestId,
        outcome: 'deny_no_session_invented',
        durationMs: Date.now() - started + session.durationMs,
      })
      throw new AuthTransientError()
    }
    if (session.state !== 'authenticated') {
      logAuthEvent({
        event: session.state === 'anonymous' ? session.event : 'AUTH_SESSION_EXPIRED',
        route: meta.route,
        code: session.code,
        requestId: meta.requestId,
        outcome: 'no_user',
        durationMs: session.durationMs,
      })
      return null
    }

    const userId = session.userId
    let user = await prisma.user.findFirst({
      where: { clerkId: userId },
    })

    if (!user && userId.startsWith(DEV_USER_PREFIX)) {
      const suffix = userId.slice(DEV_USER_PREFIX.length)
      if (suffix.length >= 15) {
        user = await prisma.user.findFirst({ where: { id: suffix } })
      }
    }

    const canUseClerk = isClerkConfigured() && !!userId && !userId.startsWith(DEV_USER_PREFIX)
    const needsClerkProfile = canUseClerk && !user
    const needsFreshEmail = canUseClerk && !!user && !user.isActive
    let identity: ClerkIdentity | null = null
    if (needsClerkProfile || needsFreshEmail) {
      const loaded = await getClerkIdentity(userId)
      if (loaded === 'not_found') {
        logAuthEvent({
          event: 'AUTH_INTERNAL_USER_DENIED',
          route: meta.route,
          code: 'clerk_user_not_found',
          requestId: meta.requestId,
          outcome: 'redirect_non_autorizzato',
          durationMs: Date.now() - started,
        })
        return null
      }
      identity = loaded
    }

    const email = normalizeEmail(identity ? identity.email : user?.email)
    const adminEmails = getEmergencyAdminEmails()
    const isAllowedByAdminEmails = !!(email && adminEmails.includes(email))

    if (needsClerkProfile && identity) {
      if (!email) {
        logAuthEvent({
          event: 'AUTH_INTERNAL_USER_DENIED',
          route: meta.route,
          code: 'missing_email',
          requestId: meta.requestId,
          outcome: 'redirect_non_autorizzato',
          durationMs: Date.now() - started,
        })
        return null
      }

      try {
        const matches = await findUsersByEmailInsensitive(email)
        if (matches.length > 1) {
          user =
            matches.find((match) => match.clerkId === userId) ??
            matches.find((match) => !match.clerkId && match.isActive) ??
            matches.find((match) => match.isActive) ??
            matches[0]
        } else if (matches.length === 1) {
          user = matches[0]
        }

        if (user) {
          if (user.clerkId && user.clerkId !== userId) {
            logAuthEvent({
              event: 'AUTH_INTERNAL_USER_DENIED',
              route: meta.route,
              code: 'clerk_id_mismatch',
              requestId: meta.requestId,
              outcome: 'redirect_non_autorizzato',
              durationMs: Date.now() - started,
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
              name: identity.name || email.split('@')[0] || 'Utente',
              clerkId: userId,
              isActive: true,
            },
          })
        }
      } catch (error) {
        if (error instanceof AuthTransientError) throw error
        if (isDatabaseError(error)) throw new AuthTransientError(undefined, 'database')
        throw new AuthTransientError()
      }
    }

    if (user && !user.isActive && isAllowedByAdminEmails) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          clerkId: userId.startsWith(DEV_USER_PREFIX) ? user.clerkId : userId,
        },
      })
    }

    const role = (user as { role?: string } | null)?.role
    const userIsValid = isAuthorizedAppUser(user ? { isActive: user.isActive, role } : null)
    if (!userIsValid || !user) {
      const denialReason: DenialReason = !user
        ? 'internal_user_not_found'
        : !user.isActive
          ? 'user_disabled'
          : 'invalid_role'
      logAuthEvent({
        event: 'AUTH_INTERNAL_USER_DENIED',
        route: meta.route,
        code: denialReason,
        requestId: meta.requestId,
        outcome: 'redirect_non_autorizzato',
        durationMs: Date.now() - started,
      })
      return null
    }

    if (process.env.AUTH_LOG_VALID === '1') {
      logAuthEvent({
        event: 'AUTH_SESSION_VALID',
        route: meta.route,
        code: null,
        requestId: meta.requestId,
        outcome: 'allow',
        durationMs: Date.now() - started,
      })
    }

    return {
      id: user.id,
      userId,
      name: user.name,
      email: user.email,
      role: role as UserRole,
    }
  } catch (err) {
    if (err instanceof AuthTransientError) {
      if (sessionState !== 'transient') {
        logAuthEvent({
          event: err.source === 'database' ? 'AUTH_DATABASE_ERROR' : 'AUTH_PROVIDER_TRANSIENT_ERROR',
          route: meta.route,
          code: err.source === 'database' ? 'database_unavailable' : 'AUTH_TRANSIENT',
          requestId: meta.requestId,
          outcome: 'redirect_temporary_error',
          durationMs: Date.now() - started,
        })
      }
      throw err
    }
    if (isDatabaseError(err)) {
      logAuthEvent({
        event: 'AUTH_DATABASE_ERROR',
        route: meta.route,
        code: 'database_unavailable',
        requestId: meta.requestId,
        outcome: 'redirect_temporary_error',
        durationMs: Date.now() - started,
      })
      throw new AuthTransientError(undefined, 'database')
    }
    logAuthEvent({
      event: 'AUTH_UNCLASSIFIED_ERROR',
      route: meta.route,
      code: 'unclassified',
      requestId: meta.requestId,
      outcome: 'redirect_temporary_error',
      durationMs: Date.now() - started,
    })
    throw new AuthTransientError()
  }
})

export async function getAuthDecisionDebug(): Promise<AuthDecisionDebug> {
  try {
    const session = await getRequestSession()
    if (session.state === 'transient') {
      return { foundDbUser: false, finalDecision: 'transient', reasonDenied: session.code }
    }
    if (session.state !== 'authenticated') {
      return {
        foundDbUser: false,
        finalDecision: 'deny',
        reasonDenied: session.state === 'anonymous' ? session.code : 'session_refresh_required',
      }
    }
    const currentUser = await getCurrentUser()
    return {
      foundDbUser: !!currentUser,
      finalDecision: currentUser ? 'allow' : 'deny',
      reasonDenied: currentUser ? null : 'internal_user_not_found',
    }
  } catch (error) {
    if (error instanceof AuthTransientError || isDatabaseError(error)) {
      return { foundDbUser: false, finalDecision: 'transient', reasonDenied: 'temporary' }
    }
    return { foundDbUser: false, finalDecision: 'transient', reasonDenied: 'unclassified' }
  }
}

/** Solo lettura: Agente può vedere solo clienti e preventivi, senza modificare. */
export function canWrite(user: CurrentUser | null): boolean {
  return user?.role === 'ADMIN'
}

export function isAgente(user: CurrentUser | null): boolean {
  return user?.role === 'AGENTE'
}

export async function auth() {
  const userId = await getAuthUserId()
  return { userId }
}

async function redirectToSignIn(route: string | null, requestId: string | null, code: string, durationMs: number) {
  logAuthEvent({
    event: 'AUTH_REDIRECT_SIGNIN',
    route,
    code,
    requestId,
    outcome: 'redirect_signin',
    durationMs,
  })
  redirect(isClerkConfigured() ? '/sign-in' : '/dev-users')
}

/**
 * - Sessione assente, scaduta o revocata → /sign-in
 * - Token da rinnovare → recupero documento, senza logout
 * - Errore temporaneo → /errore-temporaneo
 * - Sessione valida ma utente non abilitato → /non-autorizzato
 */
export async function requireAuth(): Promise<CurrentUser> {
  const meta = await getRequestMeta()
  try {
    const session = await getRequestSession()
    if (session.state === 'transient') {
      logAuthEvent({
        event: 'AUTH_REDIRECT_TEMPORARY_ERROR',
        route: meta.route,
        code: session.code,
        requestId: meta.requestId,
        outcome: 'redirect_temporary_error',
        durationMs: session.durationMs,
      })
      redirect('/errore-temporaneo')
    }
    if (session.state === 'recover') {
      const next = safeInternalPath(meta.route)
      logAuthEvent({
        event: 'AUTH_REDIRECT_RECOVERY',
        route: meta.route,
        code: session.code,
        requestId: meta.requestId,
        outcome: 'redirect_recovery',
        durationMs: session.durationMs,
      })
      redirect(`${AUTH_RECOVERY_PATH}?next=${encodeURIComponent(next)}`)
    }
    if (session.state === 'anonymous') {
      await redirectToSignIn(meta.route, meta.requestId, session.code, session.durationMs)
    }

    const user = await getCurrentUser()
    if (!user) {
      logAuthEvent({
        event: 'AUTH_INTERNAL_USER_DENIED',
        route: meta.route,
        code: 'not_enabled',
        requestId: meta.requestId,
        outcome: 'redirect_non_autorizzato',
        durationMs: session.durationMs,
      })
      redirect('/non-autorizzato')
    }
    return user as CurrentUser
  } catch (err) {
    if (isRedirectError(err)) throw err
    if (err instanceof AuthTransientError || isDatabaseError(err)) {
      logAuthEvent({
        event: 'AUTH_REDIRECT_TEMPORARY_ERROR',
        route: meta.route,
        code: err instanceof AuthTransientError ? err.code : 'database_unavailable',
        requestId: meta.requestId,
        outcome: 'redirect_temporary_error',
        durationMs: null,
      })
      redirect('/errore-temporaneo')
    }
    logAuthEvent({
      event: 'AUTH_UNCLASSIFIED_ERROR',
      route: meta.route,
      code: 'unclassified',
      requestId: meta.requestId,
      outcome: 'redirect_temporary_error',
      durationMs: null,
    })
    redirect('/errore-temporaneo')
  }
}
