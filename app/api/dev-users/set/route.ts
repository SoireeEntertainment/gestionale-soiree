import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEV_COOKIE_NAME } from '@/lib/auth-dev'

// Prisma usa CUID (es. clxxx...), non UUID
function isValidId(s: string | null): s is string {
  return !!s && s.length >= 20 && s.length <= 30 && /^[a-z0-9]+$/i.test(s)
}

export async function GET(request: NextRequest) {
  const clerkConfigured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  )
  if (clerkConfigured) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const userId = request.nextUrl.searchParams.get('userId')
  if (!isValidId(userId)) {
    return NextResponse.redirect(new URL('/dev-users', request.url))
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
  })
  if (!user) {
    return NextResponse.redirect(new URL('/dev-users', request.url))
  }

  const baseUrl = request.nextUrl.origin
  const dashboardUrl = `${baseUrl}/dashboard`

  // Alcuni browser non inviano il cookie sul primo redirect 302; usiamo 200 + Set-Cookie + meta refresh
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${dashboardUrl}"></head><body>Accesso in corso... <a href="${dashboardUrl}">Vai alla Dashboard</a></body></html>`
  const res = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
  res.cookies.set(DEV_COOKIE_NAME, userId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
