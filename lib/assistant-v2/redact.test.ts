import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { redactDeep, sanitizeUntrustedText } from '@/lib/assistant-v2/redact'

describe('assistant-v2 redact', () => {
  it('redige password e token', () => {
    const out = redactDeep({
      title: 'ok',
      password: 'segreto',
      nested: { apiKey: 'xyz', note: 'ciao' },
    }) as Record<string, unknown>
    assert.equal(out.password, '[REDACTED]')
    assert.equal((out.nested as Record<string, unknown>).apiKey, '[REDACTED]')
    assert.equal((out.nested as Record<string, unknown>).note, 'ciao')
  })

  it('sanitizza testi lunghi non attendibili', () => {
    assert.equal(sanitizeUntrustedText('a'.repeat(5000), 100).length, 100)
  })
})
