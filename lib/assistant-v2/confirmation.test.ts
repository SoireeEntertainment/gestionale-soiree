import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { describe, it } from 'node:test'
import { verifyPayloadHash } from '@/lib/assistant-v2/confirmation/service'

describe('assistant-v2 confirmation payload hash', () => {
  it('stesso payload → stesso hash', () => {
    const payload = { title: 'Chiamare Oneforall', dueDate: '2026-11-07' }
    const a = createHash('sha256').update('create_daily_task').update('|').update(JSON.stringify(payload)).digest('hex')
    assert.equal(verifyPayloadHash('create_daily_task', payload, a), true)
  })

  it('payload diverso → hash diverso (blocco conferma alterata)', () => {
    const payload = { title: 'A', dueDate: '2026-11-07' }
    const hash = createHash('sha256').update('create_daily_task').update('|').update(JSON.stringify(payload)).digest('hex')
    assert.equal(
      verifyPayloadHash('create_daily_task', { title: 'B', dueDate: '2026-11-07' }, hash),
      false
    )
  })
})
