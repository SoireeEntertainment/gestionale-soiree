import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/dev-users',
  '/non-autorizzato',
  '/api/dev-users(.*)',
  '/api/health',
])

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth().protect()
  }
})

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    if (req.nextUrl.pathname === '/sign-in') {
      return NextResponse.redirect(new URL('/dev-users', req.url))
    }
    return NextResponse.next()
  }
  return clerkHandler(req, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
