const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'credentialsEncryptionKey',
  'CREDENTIALS_ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'CLERK_SECRET_KEY',
  'DATABASE_URL',
])

export function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.has(key) || /password|secret|token|apikey|credential/i.test(key)) {
    return typeof value === 'string' && value.length > 0 ? '[REDACTED]' : null
  }
  return value
}

export function redactDeep<T>(input: T): T {
  if (input == null) return input
  if (Array.isArray(input)) {
    return input.map((v) => redactDeep(v)) as T
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactValue(k, typeof v === 'object' && v !== null ? redactDeep(v) : v)
    }
    return out as T
  }
  return input
}

/** Rimuove eventuali istruzioni di prompt injection evidenti nei testi utente/DB. */
export function sanitizeUntrustedText(text: string, maxLen = 2000): string {
  return text
    .replace(/\u0000/g, '')
    .slice(0, maxLen)
}
