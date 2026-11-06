import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAssistantAuthContext } from '@/lib/assistant-v2/auth-context'
import { ALL_ASSISTANT_TOOLS } from '@/lib/assistant-v2/tools/registry'
import type { CurrentUser } from '@/lib/auth-dev'

const adminUser = {
  id: 'admin1',
  userId: 'admin1',
  name: 'Admin',
  email: 'admin@test.it',
  role: 'ADMIN',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  clerkId: 'c1',
} as unknown as CurrentUser

describe('assistant-v2 security invariants', () => {
  it('auth context disabilita lettura credenziali', () => {
    const ctx = buildAssistantAuthContext(adminUser)
    assert.equal(ctx.permissions.canReadCredentials, false)
  })

  it('nessun tool name sospetto', () => {
    for (const t of ALL_ASSISTANT_TOOLS) {
      assert.doesNotMatch(t.name, /sql|shell|exec|eval|password|credential/i)
    }
  })

  it('tool write sempre con conferma', () => {
    const writes = ALL_ASSISTANT_TOOLS.filter((t) => t.kind === 'write')
    assert.ok(writes.length > 5)
    for (const t of writes) {
      assert.equal(t.requiresConfirmation, true)
    }
  })
})
