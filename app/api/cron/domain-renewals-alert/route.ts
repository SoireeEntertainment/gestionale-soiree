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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDomainRenewalsAlertEmail()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/domain-renewals-alert]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
