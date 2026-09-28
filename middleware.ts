import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'

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
  if (!isPublicRoute(req)) {
    // Next.js middleware richiede URL assoluti per NextResponse.redirect.
    // Un path relativo (es. "/sign-in") lancia "URL is malformed" → MIDDLEWARE_INVOCATION_FAILED.
    await auth().protect({
      unauthenticatedUrl: new URL(SIGN_IN_PATH, req.url).href,
    })
  }
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
    console.error('[Middleware]', {
      pathname: req.nextUrl.pathname,
      message,
      name: error instanceof Error ? error.name : undefined,
    })

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
