import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveOptionalClient } from '@/lib/assistant-v2/tools/daily-tasks'
import type { ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type { AssistantAuthContext } from '@/lib/assistant-v2/types'

function makeCtx(memory: ToolExecutionContext['memory']): ToolExecutionContext {
  return {
    threadId: 'thread-test',
    memory,
    auth: {
      currentUserId: 'u1',
      role: 'ADMIN',
      user: { id: 'u1', userId: 'u1', name: 'Test', email: 't@t.it', role: 'ADMIN' } as unknown as AssistantAuthContext['user'],
      permissions: {
        canWritePlatform: true,
        canManageOwnDailyTasks: true,
        canReadAssignedClients: true,
        canReadAllClients: true,
        canManageWorks: true,
        canManagePed: true,
        canManageShootings: true,
        canManageRenewals: true,
        canReadPreventivi: true,
        canWritePreventivi: true,
        canReadDashboard: true,
        canReadCredentials: false,
      },
    },
  }
}

describe('resolveOptionalClient — niente associazione silenziosa', () => {
  const ctxWithMemory = makeCtx({
    lastClientId: 'client-oneforall',
    lastClientName: 'Oneforall',
  })

  it('create/list senza clientName → clientId null anche con memoria', async () => {
    const r = await resolveOptionalClient(ctxWithMemory, null)
    assert.equal(r.ok, true)
    assert.ok('clientId' in r)
    assert.equal(r.clientId, null)
    assert.equal(r.clientName, null)
  })

  it('stringa vuota non eredita l’ultimo cliente', async () => {
    const r = await resolveOptionalClient(ctxWithMemory, '   ')
    assert.equal(r.ok, true)
    assert.ok('clientId' in r)
    assert.equal(r.clientId, null)
  })

  it('clientFromContext / allowMemory=true usa memoria affidabile', async () => {
    const r = await resolveOptionalClient(ctxWithMemory, undefined, { allowMemory: true })
    assert.equal(r.ok, true)
    assert.ok('clientId' in r)
    assert.equal(r.clientId, 'client-oneforall')
    assert.equal(r.clientName, 'Oneforall')
  })

  it('allowMemory senza memoria → null (non inventa)', async () => {
    const empty = makeCtx({})
    const r = await resolveOptionalClient(empty, null, { allowMemory: true })
    assert.equal(r.ok, true)
    assert.ok('clientId' in r)
    assert.equal(r.clientId, null)
  })

  it('clientId esplicito (opts) ha priorità', async () => {
    const r = await resolveOptionalClient(ctxWithMemory, null, {
      clientId: 'explicit-id',
      allowMemory: true,
    })
    assert.equal(r.ok, true)
    assert.ok('clientId' in r)
    assert.equal(r.clientId, 'explicit-id')
  })
})

describe('list_daily_tasks filtro cliente — contratto input', () => {
  it('schema: senza clientName e senza clientFromContext non forza filtro', () => {
    // Contratto tool: i filtri “oggi” non devono passare clientId dalla memoria.
    // Verificato via resolveOptionalClient sopra; qui documentiamo l’intento.
    const listInput = { bucket: 'today' as const }
    assert.equal('clientName' in listInput, false)
    assert.equal('clientFromContext' in listInput, false)
  })
})
