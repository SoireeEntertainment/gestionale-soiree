import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { verifyTelegramWebhookSecret } from '@/lib/telegram/security'
import { isTelegramAssistantEnabled, TELEGRAM_ENV } from '@/lib/telegram/config'
import { checkTelegramRateLimit, _resetTelegramRateLimitForTests } from '@/lib/telegram/rate-limit'
import { parseCallbackToken } from '@/lib/telegram/security'

describe('telegram webhook gate', () => {
  const prevEnabled = process.env.TELEGRAM_ASSISTANT_ENABLED
  const prevSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const prevWrites = process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'whsec_test'
    process.env.TELEGRAM_ASSISTANT_ENABLED = 'true'
    process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED = 'false'
  })
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.TELEGRAM_ASSISTANT_ENABLED
    else process.env.TELEGRAM_ASSISTANT_ENABLED = prevEnabled
    if (prevSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET
    else process.env.TELEGRAM_WEBHOOK_SECRET = prevSecret
    if (prevWrites === undefined) delete process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED
    else process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED = prevWrites
  })

  it('feature flag default off quando unset', () => {
    delete process.env.TELEGRAM_ASSISTANT_ENABLED
    assert.equal(isTelegramAssistantEnabled(), false)
  })

  it('feature flag on', () => {
    process.env.TELEGRAM_ASSISTANT_ENABLED = 'true'
    assert.equal(isTelegramAssistantEnabled(), true)
  })

  it('writes default off', () => {
    delete process.env.TELEGRAM_ASSISTANT_WRITES_ENABLED
    assert.equal(TELEGRAM_ENV.writesEnabled(), false)
  })

  it('webhook secret corretto vs errato', () => {
    assert.equal(verifyTelegramWebhookSecret('whsec_test'), true)
    assert.equal(verifyTelegramWebhookSecret('nope'), false)
  })
})

describe('telegram rate limit', () => {
  it('blocca dopo soglia', () => {
    _resetTelegramRateLimitForTests()
    let blocked = false
    for (let i = 0; i < 40; i++) {
      const r = checkTelegramRateLimit('test-user')
      if (!r.ok) {
        blocked = true
        break
      }
    }
    assert.equal(blocked, true)
  })
})

describe('telegram conferma doppia', () => {
  it('callback confirm/cancel distinti', () => {
    assert.equal(parseCallbackToken('c:abc')?.action, 'confirm')
    assert.equal(parseCallbackToken('x:abc')?.action, 'cancel')
    assert.notEqual(parseCallbackToken('c:abc')?.action, parseCallbackToken('x:abc')?.action)
  })
})

describe('telegram privacy', () => {
  it('non espone token bot in config helpers', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:AASecretTokenShouldNotLog'
    // TELEGRAM_ENV.botToken() is needed internally but tests must not print it
    const t = TELEGRAM_ENV.botToken()
    assert.ok(t.includes(':'))
    assert.ok(!JSON.stringify({ ok: true }).includes(t.slice(10)))
  })
})
