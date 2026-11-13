import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { TELEGRAM_ENV } from '@/lib/telegram/config'

export function verifyTelegramWebhookSecret(headerValue: string | null): boolean {
  const expected = TELEGRAM_ENV.webhookSecret()
  if (!expected || !headerValue) return false
  const a = Buffer.from(headerValue)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function hashLinkToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function generateLinkToken(): string {
  // URL-safe, adatto a deep link Telegram start payload (max ~64 bytes)
  return randomBytes(24).toString('base64url')
}

export function opaqueCallbackToken(pendingId: string, action: 'confirm' | 'cancel'): string {
  // Telegram callback_data max 64 bytes — usiamo prefisso + id corto
  const prefix = action === 'confirm' ? 'c:' : 'x:'
  return `${prefix}${pendingId}`.slice(0, 64)
}

export function parseCallbackToken(
  data: string
): { action: 'confirm' | 'cancel'; pendingId: string } | null {
  if (data.startsWith('c:') && data.length > 2) {
    return { action: 'confirm', pendingId: data.slice(2) }
  }
  if (data.startsWith('x:') && data.length > 2) {
    return { action: 'cancel', pendingId: data.slice(2) }
  }
  return null
}
