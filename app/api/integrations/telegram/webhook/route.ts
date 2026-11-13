import { after, NextResponse } from 'next/server'
import { isTelegramAssistantEnabled, TELEGRAM_ENV } from '@/lib/telegram/config'
import { enqueueTelegramUpdate } from '@/lib/telegram/queue'
import { verifyTelegramWebhookSecret } from '@/lib/telegram/security'
import { telegramLog } from '@/lib/telegram/bot-api'
import { drainTelegramJobs } from '@/lib/telegram/worker'
import type { TelegramUpdate } from '@/lib/telegram/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!isTelegramAssistantEnabled()) {
    return NextResponse.json({ ok: true, disabled: true })
  }

  if (!TELEGRAM_ENV.botToken() || !TELEGRAM_ENV.webhookSecret()) {
    telegramLog('webhook_misconfigured')
    return NextResponse.json({ error: 'Misconfigured' }, { status: 503 })
  }

  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!verifyTelegramWebhookSecret(secret)) {
    telegramLog('webhook_unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof update?.update_id !== 'number') {
    return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
  }

  const enqueued = await enqueueTelegramUpdate(update)
  telegramLog('webhook_enqueued', {
    updateId: update.update_id,
    created: enqueued.created,
  })

  // Risposta rapida a Telegram; elaborazione persistente via after() + cron fallback
  after(async () => {
    try {
      await drainTelegramJobs(3)
    } catch (e) {
      telegramLog('after_drain_error', {
        message: e instanceof Error ? e.message : 'unknown',
      })
    }
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({
    service: 'soiree-telegram-assistant',
    enabled: isTelegramAssistantEnabled(),
  })
}
