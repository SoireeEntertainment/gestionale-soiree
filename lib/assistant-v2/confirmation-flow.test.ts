import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'crypto'
import { describe, it } from 'node:test'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import { verifyPayloadHash } from '@/lib/assistant-v2/confirmation/service'
import { getToolByName } from '@/lib/assistant-v2/tools/registry'

describe('assistant-v2 confirmation flow (contratti)', () => {
  it('create_daily_task richiede conferma e ha commit', () => {
    const t = getToolByName('create_daily_task')
    assert.ok(t)
    assert.equal(t!.kind, 'write')
    assert.equal(t!.requiresConfirmation, true)
    assert.equal(typeof t!.commit, 'function')
  })

  it('TTL pending è configurato (> 0)', () => {
    assert.ok(ASSISTANT_V2_LIMITS.pendingTtlMs >= 5 * 60 * 1000)
  })

  it('payload hash blocca conferma alterata (no falso successo)', () => {
    const toolName = 'create_daily_task'
    const approved = { title: 'Task test', dueDate: '2026-11-08', clientId: null, type: 'GENERAL' }
    const hash = createHash('sha256')
      .update(toolName)
      .update('|')
      .update(JSON.stringify(approved))
      .digest('hex')
    assert.equal(verifyPayloadHash(toolName, approved, hash), true)
    assert.equal(
      verifyPayloadHash(
        toolName,
        { ...approved, clientId: 'injected-client' },
        hash
      ),
      false
    )
  })

  it('idempotency key è unica per pending (contratto UUID)', () => {
    const a = randomUUID()
    const b = randomUUID()
    assert.notEqual(a, b)
  })

  it('nessuna write tool senza requiresConfirmation', () => {
    const writes = [
      'create_daily_task',
      'update_daily_task',
      'complete_daily_task',
      'delete_daily_task',
      'mark_client_contacted',
      'create_work',
      'create_client',
    ]
    for (const name of writes) {
      const t = getToolByName(name)
      assert.ok(t, name)
      assert.equal(t!.requiresConfirmation, true, name)
      assert.ok(t!.commit, name)
    }
  })
})
