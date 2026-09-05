import { NextRequest, NextResponse } from 'next/server'
import { sendDomainRenewalsAlertEmail } from '@/lib/domain-renewals-alert'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    console.error('[cron/domain-renewals-alert] unauthorized (missing/invalid CRON_SECRET)')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDomainRenewalsAlertEmail()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[cron/domain-renewals-alert] FAILED', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
