/** Configurazione centralizzata Assistente V2 (niente model hardcoded nei tool). */

export const ASSISTANT_V2_ENV = {
  enabled: () => {
    const v = process.env.ASSISTANT_V2_ENABLED?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
  },
  /** Default preview-friendly: se non impostato, false in production. */
  enabledForClient: () => {
    const pub = process.env.NEXT_PUBLIC_ASSISTANT_V2_ENABLED?.trim().toLowerCase()
    if (pub === '1' || pub === 'true' || pub === 'yes' || pub === 'on') return true
    if (pub === '0' || pub === 'false' || pub === 'no' || pub === 'off') return false
    return ASSISTANT_V2_ENV.enabled()
  },
  model: () => process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  apiKey: () => process.env.OPENAI_API_KEY?.trim() || '',
} as const

export const ASSISTANT_V2_LIMITS = {
  maxToolCallsPerTurn: 8,
  maxSteps: 6,
  maxTokens: 2048,
  requestTimeoutMs: 55_000,
  historyMessages: 24,
  maxResultItems: 40,
  maxMessageChars: 4000,
  pendingTtlMs: 30 * 60 * 1000,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 20,
  concurrentPerUser: 1,
} as const

export function isAssistantV2Enabled(): boolean {
  return ASSISTANT_V2_ENV.enabled()
}
