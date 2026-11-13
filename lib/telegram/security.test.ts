import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import {
  generateLinkToken,
  hashLinkToken,
  opaqueCallbackToken,
  parseCallbackToken,
  verifyTelegramWebhookSecret,
} from '@/lib/telegram/security'

describe('telegram security', () => {
  const prev = process.env.TELEGRAM_WEBHOOK_SECRET

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-token-abc'
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET
    else process.env.TELEGRAM_WEBHOOK_SECRET = prev
  })

  it('accetta secret_token corretto', () => {
    assert.equal(verifyTelegramWebhookSecret('test-secret-token-abc'), true)
  })

  it('rifiuta secret_token errato', () => {
    assert.equal(verifyTelegramWebhookSecret('wrong'), false)
    assert.equal(verifyTelegramWebhookSecret(null), false)
    assert.equal(verifyTelegramWebhookSecret(''), false)
  })

  it('hash link token è deterministico e non in chiaro', () => {
    const raw = generateLinkToken()
    assert.ok(raw.length >= 20)
    const h1 = hashLinkToken(raw)
    const h2 = hashLinkToken(raw)
    assert.equal(h1, h2)
    assert.notEqual(h1, raw)
    assert.equal(h1.length, 64)
  })

  it('callback token opachi e parseabili', () => {
    const c = opaqueCallbackToken('pend_123', 'confirm')
    const x = opaqueCallbackToken('pend_123', 'cancel')
    assert.deepEqual(parseCallbackToken(c), { action: 'confirm', pendingId: 'pend_123' })
    assert.deepEqual(parseCallbackToken(x), { action: 'cancel', pendingId: 'pend_123' })
    assert.equal(parseCallbackToken('garbage'), null)
  })
})
