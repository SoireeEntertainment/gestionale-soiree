import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAssistantAuthContext } from '@/lib/assistant-v2/auth-context'
import { canUseToolPermission } from '@/lib/assistant-v2/permissions'
import { getToolsForAuth } from '@/lib/assistant-v2/tools/registry'
import type { CurrentUser } from '@/lib/auth-dev'

describe('telegram riusa permessi gestionale', () => {
  it('AGENTE non ha ped_write/ped_read', () => {
    const user: CurrentUser = {
      id: 'u1',
      userId: 'u1',
      name: 'Agente',
      email: 'a@soiree.it',
      role: 'AGENTE',
    }
    const auth = buildAssistantAuthContext(user)
    assert.equal(canUseToolPermission(auth, 'ped_read', 'read'), false)
    assert.equal(canUseToolPermission(auth, 'ped_write', 'write'), false)
    assert.equal(canUseToolPermission(auth, 'daily_tasks', 'write'), true)
    const tools = getToolsForAuth(auth)
    assert.ok(!tools.some((t) => t.name === 'create_ped_item'))
    assert.ok(tools.some((t) => t.name === 'create_daily_task'))
  })

  it('ADMIN ha PED', () => {
    const user: CurrentUser = {
      id: 'u2',
      userId: 'u2',
      name: 'Admin',
      email: 'admin@soiree.it',
      role: 'ADMIN',
    }
    const auth = buildAssistantAuthContext(user)
    assert.equal(canUseToolPermission(auth, 'ped_read', 'read'), true)
    assert.equal(canUseToolPermission(auth, 'ped_write', 'write'), true)
    assert.ok(getToolsForAuth(auth).some((t) => t.name === 'list_ped_day'))
  })
})
