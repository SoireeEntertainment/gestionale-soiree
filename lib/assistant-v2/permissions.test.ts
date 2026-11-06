import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canUseToolPermission } from '@/lib/assistant-v2/permissions'
import type { AssistantAuthContext } from '@/lib/assistant-v2/types'

function auth(role: 'ADMIN' | 'AGENTE'): AssistantAuthContext {
  const isAdmin = role === 'ADMIN'
  return {
    currentUserId: 'u1',
    role,
    user: {
      id: 'u1',
      userId: 'u1',
      name: 'Test',
      email: 't@test.it',
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      clerkId: null,
    } as unknown as AssistantAuthContext['user'],
    permissions: {
      canWritePlatform: isAdmin,
      canManageOwnDailyTasks: true,
      canReadAssignedClients: true,
      canReadAllClients: isAdmin,
      canManageWorks: isAdmin,
      canManagePed: isAdmin,
      canManageShootings: isAdmin,
      canManageRenewals: isAdmin,
      canReadPreventivi: true,
      canWritePreventivi: isAdmin,
      canReadDashboard: isAdmin,
      canReadCredentials: false,
    },
  }
}

describe('assistant-v2 permissions', () => {
  it('AGENTE può gestire le proprie daily tasks', () => {
    assert.equal(canUseToolPermission(auth('AGENTE'), 'daily_tasks', 'write'), true)
    assert.equal(canUseToolPermission(auth('AGENTE'), 'contact_client', 'write'), true)
  })

  it('AGENTE non gestisce lavori / PED / dashboard', () => {
    assert.equal(canUseToolPermission(auth('AGENTE'), 'works_write', 'write'), false)
    assert.equal(canUseToolPermission(auth('AGENTE'), 'works_read', 'read'), false)
    assert.equal(canUseToolPermission(auth('AGENTE'), 'ped_write', 'write'), false)
    assert.equal(canUseToolPermission(auth('AGENTE'), 'dashboard_read', 'read'), false)
  })

  it('ADMIN gestisce lavori e dashboard', () => {
    assert.equal(canUseToolPermission(auth('ADMIN'), 'works_write', 'write'), true)
    assert.equal(canUseToolPermission(auth('ADMIN'), 'dashboard_read', 'read'), true)
  })
})
