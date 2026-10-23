/**
 * Classificazione pura delle decisioni di autenticazione.
 * Non legge cookie, token o segreti e non concede accesso.
 */

export const AUTH_RECOVERY_PARAM = '__gsr'
export const AUTH_RECOVERY_PATH = '/ripristino-sessione'

export type AuthLogEvent =
  | 'AUTH_SESSION_VALID'
  | 'AUTH_SESSION_MISSING'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_PROVIDER_TRANSIENT_ERROR'
  | 'AUTH_DATABASE_ERROR'
  | 'AUTH_INTERNAL_USER_DENIED'
  | 'AUTH_REDIRECT_SIGNIN'
  | 'AUTH_REDIRECT_TEMPORARY_ERROR'
  | 'AUTH_REDIRECT_RECOVERY'
  | 'AUTH_UNCLASSIFIED_ERROR'

export type ProviderSessionDecision =
  | { kind: 'authenticated' }
  | {
      kind: 'sign-in'
      event: 'AUTH_SESSION_MISSING' | 'AUTH_SESSION_EXPIRED' | 'AUTH_SESSION_REVOKED'
      code: string
    }
  | { kind: 'recover'; code: string }
  | {
      kind: 'temporary'
      event: 'AUTH_PROVIDER_TRANSIENT_ERROR' | 'AUTH_UNCLASSIFIED_ERROR'
      code: string
    }

const MISSING_REASONS = new Set([
  'session-token-and-uat-missing',
  'session-token-missing',
  'signed_out_unspecified',
])

const RECOVERABLE_REASONS = new Set([
  'session-token-expired',
  'token-expired',
  'session-token-expired-refresh-non-eligible-non-get',
  'session-token-expired-refresh-non-eligible-no-cookie',
  'session-token-expired-refresh-null',
  'session-token-expired-refresh-missing-refresh-token',
  'session-token-expired-refresh-missing-session-token',
  'client-uat-but-no-session-token',
  'session-token-but-no-client-uat',
  'session-token-iat-before-client-uat',
  'session-token-nbf',
  'session-token-iat-in-the-future',
  'token-not-active-yet',
  'token-iat-in-the-future',
  'dev-browser-missing',
  'dev-browser-sync',
])

const TRANSIENT_REASONS = new Set([
  'unexpected-error',
  'unexpected_error',
  'unexpected-sdk-error',
  'fetch-error',
  'timeout',
  'network',
  'auth_status_missing',
  'auth_threw',
  'jwk-remote-failed-to-load',
  'jwk-remote-invalid',
  'jwk-remote-missing',
  'jwk-failed-to-resolve',
  'jwk-local-missing',
  'jwk-kid-mismatch',
  'secret-key-invalid',
  'token-verification-failed',
  'token-invalid-authorized-parties',
  'too_many_requests',
])

const TRANSIENT_REFRESH_SUFFIXES = new Set([
  'fetch-error',
  'unexpected-error',
  'unexpected_error',
  'unexpected-sdk-error',
  'timeout',
  'network',
  'too_many_requests',
  'internal_clerk_error',
])

const RECOVERABLE_REFRESH_SUFFIXES = new Set([
  'non-eligible-non-get',
  'non-eligible-no-cookie',
  'null',
  'undefined',
  'missing-refresh-token',
  'missing-session-token',
  'missing-api-client',
])

const REVOKED_EXACT = new Set([
  'token-invalid',
  'token-invalid-algorithm',
  'session_token_consumed',
])

const BLOCKED_RETURN_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/sign-out',
  '/login',
  '/ripristino-sessione',
  '/errore-temporaneo',
  '/non-autorizzato',
  '/dev-users',
]

export function readAuthReason(state: { debug?: () => Record<string, unknown> } | null | undefined): string | null {
  try {
    const reason = state?.debug?.()?.reason
    return typeof reason === 'string' ? reason : null
  } catch {
    return null
  }
}

export function sanitizeRoute(value: string | null | undefined): string | null {
  if (!value) return null
  const path = value.split('?')[0]?.split('#')[0] ?? ''
  if (!path.startsWith('/') || path.startsWith('//')) return null
  const cleaned = path.replace(/[^A-Za-z0-9/_\-.]/g, '').slice(0, 180)
  return cleaned.startsWith('/') ? cleaned : null
}

export function sanitizeCode(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/[^A-Za-z0-9_.:-]/g, '_').replace(/_+/g, '_').slice(0, 120)
  return cleaned || null
}

export function sanitizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120)
  return cleaned || null
}

export function logAuthEvent(input: {
  event: AuthLogEvent
  route?: string | null
  code?: string | null
  requestId?: string | null
  outcome: string
  durationMs?: number | null
}): void {
  const duration =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : null
  console.info(
    JSON.stringify({
      event: input.event,
      timestamp: new Date().toISOString(),
      route: sanitizeRoute(input.route),
      code: sanitizeCode(input.code),
      requestId: sanitizeRequestId(input.requestId),
      outcome: sanitizeCode(input.outcome) ?? 'unknown',
      durationMs: duration,
    })
  )
}

function isRevokedReason(reason: string): boolean {
  const value = reason.toLowerCase()
  if (REVOKED_EXACT.has(value)) return true
  return (
    value.includes('session_token_consumed') ||
    value.includes('session_revoked') ||
    value.includes('revoked') ||
    value.includes('authentication_invalid') ||
    value.includes('session_not_found')
  )
}

function classifyReason(reason: string | null): Exclude<ProviderSessionDecision, { kind: 'authenticated' }> {
  const value = (reason ?? '').trim()
  if (!value) {
    return { kind: 'sign-in', event: 'AUTH_SESSION_MISSING', code: 'signed_out_unspecified' }
  }
  if (isRevokedReason(value)) {
    return { kind: 'sign-in', event: 'AUTH_SESSION_REVOKED', code: value }
  }
  if (value.startsWith('session-token-expired-refresh-')) {
    const suffix = value.slice('session-token-expired-refresh-'.length)
    if (TRANSIENT_REFRESH_SUFFIXES.has(suffix) || TRANSIENT_REASONS.has(suffix)) {
      return { kind: 'temporary', event: 'AUTH_PROVIDER_TRANSIENT_ERROR', code: value }
    }
    if (RECOVERABLE_REFRESH_SUFFIXES.has(suffix)) {
      return { kind: 'recover', code: value }
    }
    if (suffix.startsWith('5') || suffix.includes('timeout') || suffix.includes('http_5')) {
      return { kind: 'temporary', event: 'AUTH_PROVIDER_TRANSIENT_ERROR', code: value }
    }
    return { kind: 'temporary', event: 'AUTH_UNCLASSIFIED_ERROR', code: value }
  }
  if (RECOVERABLE_REASONS.has(value)) return { kind: 'recover', code: value }
  if (MISSING_REASONS.has(value)) {
    return { kind: 'sign-in', event: 'AUTH_SESSION_MISSING', code: value }
  }
  if (TRANSIENT_REASONS.has(value)) {
    return { kind: 'temporary', event: 'AUTH_PROVIDER_TRANSIENT_ERROR', code: value }
  }
  return { kind: 'temporary', event: 'AUTH_UNCLASSIFIED_ERROR', code: value }
}

/**
 * userId presente: sessione verificata da Clerk.
 * auth() che lancia: errore tecnico, mai logout.
 * userId assente senza eccezione: Clerk ha completato la verifica.
 * Un token scaduto ma ancora rinnovabile chiede un caricamento documento
 * (handshake Clerk) una sola volta. session_token_consumed non viene ritentato.
 */
export function classifyProviderSession(input: {
  userId: string | null
  reason: string | null
  thrown: boolean
  recoveryAttempted: boolean
}): ProviderSessionDecision {
  if (input.userId) return { kind: 'authenticated' }
  if (input.thrown) {
    const code = sanitizeCode(input.reason) ?? 'auth_threw'
    return { kind: 'temporary', event: 'AUTH_PROVIDER_TRANSIENT_ERROR', code }
  }
  const decision = classifyReason(input.reason)
  if (decision.kind === 'recover' && input.recoveryAttempted) {
    return { kind: 'sign-in', event: 'AUTH_SESSION_EXPIRED', code: decision.code }
  }
  return decision
}

export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return '/dashboard'
  const trimmed = raw.trim()
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.includes('://') ||
    trimmed.includes('@')
  ) {
    return '/dashboard'
  }
  const pathname = trimmed.split('?')[0]?.split('#')[0] ?? ''
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(pathname)) return '/dashboard'
  if (BLOCKED_RETURN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return '/dashboard'
  }
  return pathname
}

export function isAuthorizedAppUser(
  user: { isActive: boolean; role?: string | null } | null | undefined
): boolean {
  if (!user?.isActive) return false
  return user.role === 'ADMIN' || user.role === 'AGENTE'
}

export function isDatabaseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; code?: string; message?: string }
  const message = (error.message ?? '').toLowerCase()
  return (
    error.name === 'PrismaClientKnownRequestError' ||
    error.name === 'PrismaClientUnknownRequestError' ||
    error.name === 'PrismaClientInitializationError' ||
    error.name === 'PrismaClientRustPanicError' ||
    error.code === 'P1001' ||
    error.code === 'P1002' ||
    error.code === 'P1008' ||
    error.code === 'P1017' ||
    message.includes("can't reach database") ||
    message.includes('connection') ||
    message.includes('timed out') ||
    message.includes('econnrefused') ||
    message.includes('econnreset')
  )
}

function readHttpStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const error = err as { status?: unknown; statusCode?: unknown }
  if (typeof error.status === 'number') return error.status
  if (typeof error.statusCode === 'number') return error.statusCode
  return null
}

function readClerkErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const error = err as { code?: unknown; errors?: Array<{ code?: unknown }> }
  if (typeof error.code === 'string') return error.code
  const nested = error.errors?.find((item) => typeof item?.code === 'string')?.code
  return typeof nested === 'string' ? nested : null
}

export function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; message?: string; code?: string }
  const message = (error.message ?? '').toLowerCase()
  return (
    error.name === 'TimeoutError' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message === 'timeout' ||
    message.includes('timed out') ||
    message.includes('timeout')
  )
}

export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const error = err as { name?: string; message?: string; code?: string }
  const message = (error.message ?? '').toLowerCase()
  const code = (error.code ?? '').toUpperCase()
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket')
  )
}

/**
 * Fallimento della Clerk Backend API durante la lettura del profilo.
 * 404 = utente Clerk inesistente. 401/403/429/5xx/rete/timeout = temporaneo,
 * non un account disabilitato.
 */
export function classifyClerkBackendFailure(err: unknown): 'not_found' | 'transient' | 'unclassified' {
  if (isTimeoutError(err) || isNetworkError(err)) return 'transient'
  const status = readHttpStatus(err)
  const code = (readClerkErrorCode(err) ?? '').toLowerCase()
  if (status === 404 || code === 'resource_not_found' || code === 'not_found') return 'not_found'
  if (
    status === 408 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    status === 401 ||
    status === 403 ||
    code === 'too_many_requests' ||
    code === 'unexpected_error' ||
    code === 'internal_clerk_error'
  ) {
    return 'transient'
  }
  if (status !== null && status >= 400) return 'unclassified'
  return 'transient'
}

export function clerkThrownCode(err: unknown): string {
  if (isTimeoutError(err)) return 'timeout'
  if (isNetworkError(err)) return 'network'
  const status = readHttpStatus(err)
  if (status) return `http_${status}`
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    if (message.includes('auth') && (message.includes('header') || message.includes('status'))) {
      return 'auth_status_missing'
    }
  }
  return 'auth_threw'
}
