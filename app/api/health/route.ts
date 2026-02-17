import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.user.count()
    return NextResponse.json({ ok: true, db: 'ok' })
  } catch (err) {
    console.error('[health]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
