import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'

type Bucket = { count: number; resetAt: number; inFlight: number }

const buckets = new Map<string, Bucket>()

function getBucket(userId: string): Bucket {
  const now = Date.now()
  const existing = buckets.get(userId)
  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 0,
      resetAt: now + ASSISTANT_V2_LIMITS.rateLimitWindowMs,
      inFlight: existing?.inFlight ?? 0,
    }
    buckets.set(userId, next)
    return next
  }
  return existing
}

export function checkAssistantRateLimit(userId: string): { ok: true } | { ok: false; error: string } {
  const b = getBucket(userId)
  if (b.inFlight >= ASSISTANT_V2_LIMITS.concurrentPerUser) {
    return { ok: false, error: 'Hai già una richiesta in corso. Attendi il completamento.' }
  }
  if (b.count >= ASSISTANT_V2_LIMITS.rateLimitMaxRequests) {
    return {
      ok: false,
      error: 'Troppe richieste all’assistente. Riprova tra un minuto.',
    }
  }
  return { ok: true }
}

export function beginAssistantRequest(userId: string): void {
  const b = getBucket(userId)
  b.count += 1
  b.inFlight += 1
}

export function endAssistantRequest(userId: string): void {
  const b = getBucket(userId)
  b.inFlight = Math.max(0, b.inFlight - 1)
}
