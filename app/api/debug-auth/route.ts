import { NextResponse } from 'next/server'
import { getAuthDecisionDebug } from '@/lib/auth-dev'

function isEnabled() {
  return process.env.NODE_ENV === 'development' || process.env.ENABLE_AUTH_DEBUG === 'true'
}

export async function GET() {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const debug = await getAuthDecisionDebug()
  return NextResponse.json(
    {
      clerkUserId: debug.clerkUserId,
      email: debug.email,
      foundDbUser: debug.foundDbUser,
      adminEmails: debug.adminEmails,
      isAllowedByAdminEmails: debug.isAllowedByAdminEmails,
      finalDecision: debug.finalDecision,
      reasonDenied: debug.reasonDenied,
    },
    { status: 200 }
  )
}
