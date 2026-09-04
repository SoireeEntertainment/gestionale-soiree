import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

const SIGN_IN_PATH = '/sign-in'

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
 * clerkMiddleware gestisce già il ritorno dal handshake (`/v1/client/handshake`).
 * Su route protette, se la sessione non è recuperabile andiamo esplicitamente a
 * /sign-in invece di ritentare il refresh verso la stessa pagina protetta
 * (evita loop session_token_consumed).
 */
const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth().protect({
      unauthenticatedUrl: SIGN_IN_PATH,
    })
  }
})

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    if (req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/dev-users', req.url))
    }
    return NextResponse.next()
  }
  return clerkHandler(req, event)
}

export const config = {
  matcher: [
    // Esclude asset statici; non tocca il dominio Clerk (es. clerk.gestionale.soiree.it)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
