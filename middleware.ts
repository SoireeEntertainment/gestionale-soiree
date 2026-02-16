import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  try {
    if (request.nextUrl.pathname === '/sign-in') {
      const clerkConfigured = !!(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        process.env.CLERK_SECRET_KEY
      )
      if (!clerkConfigured) {
        return NextResponse.redirect(new URL('/dev-users', request.url))
      }
    }
    return NextResponse.next()
  } catch (err) {
    console.error('[middleware]', err)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
