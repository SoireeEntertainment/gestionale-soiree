import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const clerkConfigured = !!(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY
  )
  const timestamp = new Date().toISOString()

  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.user.count()
    return NextResponse.json({
      ok: true,
      timestamp,
      clerkConfigured,
      db: 'ok',
    })
  } catch (err) {
    console.error('[health]', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      {
        ok: false,
        timestamp,
        clerkConfigured,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
