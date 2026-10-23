import { NextResponse } from 'next/server'
import { AuthTransientError, getAuthDecisionDebug, getCurrentUser } from '@/lib/auth-dev'

export async function GET() {
  const enabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_AUTH_DEBUG === 'true'
  if (!enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      const user = await getCurrentUser()
      if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    } catch (error) {
      if (error instanceof AuthTransientError) {
        return NextResponse.json({ error: 'temporary' }, { status: 503 })
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const debug = await getAuthDecisionDebug()
  return NextResponse.json(
    {
      foundDbUser: debug.foundDbUser,
      finalDecision: debug.finalDecision,
      reasonDenied: debug.reasonDenied,
    },
    { status: 200 }
  )
}
