/** Feature flag e limiti Soirëe Telegram Assistant. */

export const TELEGRAM_ENV = {
  enabled: () => {
    const v = process.env.TELEGRAM_ASSISTANT_ENABLED?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
  },
  /** Scrivere PED/task richiede flag esplicito (default off). */
  writesEnabled: () => {
    const v = process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
  },
  botToken: () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
  webhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '',
  botUsername: () => process.env.TELEGRAM_BOT_USERNAME?.trim() || '',
} as const

export const TELEGRAM_LIMITS = {
  linkTokenTtlMs: 10 * 60 * 1000,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 25,
  maxVoiceDurationSec: 120,
  maxVoiceBytes: 20 * 1024 * 1024,
  maxMessageChars: 3500,
  telegramMessageMax: 3900,
  jobMaxAttempts: 5,
  jobLockMs: 90_000,
  digestCronToleranceMin: 2,
} as const

export function isTelegramAssistantEnabled(): boolean {
  return TELEGRAM_ENV.enabled()
}

export function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    ''
  if (!raw) return 'https://gestionale.soiree.it'
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
}
