import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import {
  AUTH_RECOVERY_PARAM,
  AUTH_RECOVERY_PATH,
  classifyProviderSession,
  logAuthEvent,
  readAuthReason,
  safeInternalPath,
  sanitizeRequestId,
} from '@/lib/auth-classification'

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

const SIGN_IN_PATH = '/sign-in'
const TEMP_ERROR_PATH = '/errore-temporaneo'

/**
 * Route pubbliche: nessuna protezione Clerk.
 * Inclusi login/sign-in/sign-out e pagine di errore auth, così una sessione
 * non recuperabile può sempre arrivare a un login pulito senza loop.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/login',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sign-out',
  '/dev-users',
  '/non-autorizzato',
  '/errore-temporaneo',
  '/ripristino-sessione',
  '/api/dev-users(.*)',
  '/api/health',
])

/**
 * Solo errori chiaramente infrastrutturali/rete.
 * NON include session invalid/expired/unauthorized (devono restare su /sign-in).
 */
function isTransientInfrastructureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error && typeof error.name === 'string' ? error.name : ''
  const message = 'message' in error && typeof error.message === 'string' ? error.message : String(error)
  const combined = `${name} ${message}`.toLowerCase()

  // Auth/session: mai trattare come temporanei
  if (
    combined.includes('unauthenticated') ||
    combined.includes('unauthorized') ||
    combined.includes('not authenticated') ||
    combined.includes('signed out') ||
    combined.includes('session expired') ||
    combined.includes('session_token') ||
    combined.includes('token_consumed') ||
    combined.includes('forbidden') ||
    combined.includes('not signed in')
  ) {
    return false
  }

  if (name === 'AbortError' || name === 'TimeoutError' || name === 'ConnectTimeoutError') {
    return true
  }

  return (
    combined.includes('fetch failed') ||
    combined.includes('network') ||
    combined.includes('econnreset') ||
    combined.includes('econnrefused') ||
    combined.includes('etimedout') ||
    combined.includes('enotfound') ||
    combined.includes('socket hang up') ||
    combined.includes('und_err_') ||
    combined.includes('timed out') ||
    combined.includes('timeout')
  )
}

/**
 * clerkMiddleware gestisce già il ritorno dal handshake (`/v1/client/handshake`).
 * Su route protette, se la sessione non è recuperabile andiamo esplicitamente a
 * /sign-in invece di ritentare il refresh verso la stessa pagina protetta
 * (evita loop session_token_consumed).
 */
const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const started = Date.now()
  const session = auth()
  const recoveryAttempted = req.nextUrl.searchParams.get(AUTH_RECOVERY_PARAM) === '1'
  const decision = classifyProviderSession({
    userId: session.userId ?? null,
    reason: session.userId ? null : readAuthReason(session),
    thrown: false,
    recoveryAttempted,
  })
  const route = req.nextUrl.pathname
  const requestId = sanitizeRequestId(req.headers.get('x-vercel-id') ?? req.headers.get('x-request-id'))
  const durationMs = Date.now() - started
  // Next.js middleware richiede URL assoluti. Un path relativo lancia
  // "URL is malformed" → MIDDLEWARE_INVOCATION_FAILED.
  const signInUrl = new URL(SIGN_IN_PATH, req.url).href

  if (decision.kind === 'authenticated') {
    if (recoveryAttempted) {
      const clean = req.nextUrl.clone()
      clean.searchParams.delete(AUTH_RECOVERY_PARAM)
      logAuthEvent({
        event: 'AUTH_SESSION_VALID',
        route,
        code: null,
        requestId,
        outcome: 'continue',
        durationMs,
      })
      return NextResponse.redirect(clean)
    }
    if (process.env.AUTH_LOG_VALID === '1') {
      logAuthEvent({
        event: 'AUTH_SESSION_VALID',
        route,
        code: null,
        requestId,
        outcome: 'continue',
        durationMs,
      })
    }
    session.protect({ unauthenticatedUrl: signInUrl })
    return
  }

  if (decision.kind === 'temporary') {
    logAuthEvent({
      event: decision.event,
      route,
      code: decision.code,
      requestId,
      outcome: 'redirect_temporary_error',
      durationMs,
    })
    logAuthEvent({
      event: 'AUTH_REDIRECT_TEMPORARY_ERROR',
      route,
      code: decision.code,
      requestId,
      outcome: 'redirect_temporary_error',
      durationMs,
    })
    return NextResponse.redirect(new URL(TEMP_ERROR_PATH, req.url))
  }

  if (decision.kind === 'recover') {
    // Una sola navigazione documento, su una route pubblica, per lasciare
    // a Clerk l'handshake. Non si rientra sulla stessa route protetta.
    const target = new URL(AUTH_RECOVERY_PATH, req.url)
    target.searchParams.set('next', safeInternalPath(route))
    logAuthEvent({
      event: 'AUTH_REDIRECT_RECOVERY',
      route,
      code: decision.code,
      requestId,
      outcome: 'redirect_recovery',
      durationMs,
    })
    return NextResponse.redirect(target)
  }

  logAuthEvent({
    event: decision.event,
    route,
    code: decision.code,
    requestId,
    outcome: 'redirect_signin',
    durationMs,
  })
  logAuthEvent({
    event: 'AUTH_REDIRECT_SIGNIN',
    route,
    code: decision.code,
    requestId,
    outcome: 'redirect_signin',
    durationMs,
  })
  session.protect({ unauthenticatedUrl: signInUrl })
})

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    if (req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/dev-users', req.url))
    }
    return NextResponse.next()
  }

  try {
    return await clerkHandler(req, event)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Logging minimo: niente cookie, token, Authorization, secret, query
    console.error(
      JSON.stringify({
        event: isTransientInfrastructureError(error)
          ? 'AUTH_PROVIDER_TRANSIENT_ERROR'
          : 'AUTH_UNCLASSIFIED_ERROR',
        timestamp: new Date().toISOString(),
        route: req.nextUrl.pathname,
        code: message.includes('URL is malformed') || message.includes('only absolute URLs')
          ? 'malformed_url'
          : error instanceof Error
            ? error.name
            : 'middleware_error',
        requestId: null,
        outcome: 'middleware_catch',
        durationMs: null,
      })
    )

    // Difesa: redirect relativo malformato → sign-in assoluto (niente bypass auth).
    if (message.includes('URL is malformed') || message.includes('only absolute URLs')) {
      return NextResponse.redirect(new URL(SIGN_IN_PATH, req.url))
    }

    // Fallback UX solo per fallimenti infrastrutturali distinguibili.
    // Non bypassa auth: non chiama NextResponse.next() sulla route protetta.
    if (isTransientInfrastructureError(error) && req.nextUrl.pathname !== TEMP_ERROR_PATH) {
      const url = req.nextUrl.clone()
      url.pathname = TEMP_ERROR_PATH
      url.search = ''
      return NextResponse.redirect(url)
    }

    throw error
  }
}

export const config = {
  matcher: [
    // Esclude asset statici; non tocca il dominio Clerk (es. clerk.gestionale.soiree.it)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Sempre per API (raccomandato Clerk)
    '/(api|trpc)(.*)',
    // Frontend API proxy Clerk, se abilitato
    '/__clerk/(.*)',
  ],
}
