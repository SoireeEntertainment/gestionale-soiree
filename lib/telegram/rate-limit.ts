import { TELEGRAM_LIMITS } from '@/lib/telegram/config'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function checkTelegramRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + TELEGRAM_LIMITS.rateLimitWindowMs }
    buckets.set(key, b)
  }
  b.count += 1
  if (b.count > TELEGRAM_LIMITS.rateLimitMaxRequests) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) }
  }
  return { ok: true }
}

/** Solo per test. */
export function _resetTelegramRateLimitForTests() {
  buckets.clear()
}
