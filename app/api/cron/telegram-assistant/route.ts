import { NextRequest, NextResponse } from 'next/server'
import { runTelegramDailyDigests } from '@/lib/telegram/digest'
import { drainTelegramJobs } from '@/lib/telegram/worker'
import { isTelegramAssistantEnabled } from '@/lib/telegram/config'
import { telegramLog } from '@/lib/telegram/bot-api'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isTelegramAssistantEnabled()) {
    return NextResponse.json({ ok: true, disabled: true })
  }

  try {
    const jobs = await drainTelegramJobs(8)
    const digest = await runTelegramDailyDigests()
    telegramLog('cron_ok', { jobs, digest })
    return NextResponse.json({ ok: true, jobs, digest })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    telegramLog('cron_failed', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
