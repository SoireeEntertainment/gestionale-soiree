import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_ASSISTANT_TOOLS, getToolByName, getToolsForAuth } from '@/lib/assistant-v2/tools/registry'
import type { AssistantAuthContext } from '@/lib/assistant-v2/types'

describe('assistant-v2 registry', () => {
  it('ha tool daily task e contact', () => {
    assert.ok(getToolByName('create_daily_task'))
    assert.ok(getToolByName('list_daily_tasks'))
    assert.ok(getToolByName('mark_client_contacted'))
    assert.ok(getToolByName('create_work'))
    assert.ok(getToolByName('reschedule_work_deadline'))
    assert.ok(getToolByName('create_ped_item'))
    assert.ok(ALL_ASSISTANT_TOOLS.length >= 20)
  })

  it('ogni write tool ha conferma e commit', () => {
    for (const t of ALL_ASSISTANT_TOOLS) {
      if (t.kind === 'write') {
        assert.equal(t.requiresConfirmation, true, t.name)
        assert.equal(typeof t.commit, 'function', t.name)
      }
    }
  })

  it('filtra tool per AGENTE', () => {
    const auth = {
      currentUserId: 'u1',
      role: 'AGENTE',
      user: { id: 'u1', userId: 'u1', name: 'A', email: 'a@a.it', role: 'AGENTE' } as unknown as AssistantAuthContext['user'],
      permissions: {
        canWritePlatform: false,
        canManageOwnDailyTasks: true,
        canReadAssignedClients: true,
        canReadAllClients: false,
        canManageWorks: false,
        canManagePed: false,
        canManageShootings: false,
        canManageRenewals: false,
        canReadPreventivi: true,
        canWritePreventivi: false,
        canReadDashboard: false,
        canReadCredentials: false,
      },
    } as AssistantAuthContext

    const tools = getToolsForAuth(auth)
    assert.ok(tools.some((t) => t.name === 'create_daily_task'))
    assert.ok(!tools.some((t) => t.name === 'create_work'))
    assert.ok(!tools.some((t) => t.name === 'get_dashboard_stats'))
  })

  it('nessun tool execute_sql / fetch arbitrario', () => {
    const banned = ['execute_sql', 'execute_command', 'fetch_any_url']
    for (const name of banned) {
      assert.equal(getToolByName(name), undefined)
    }
  })
})
