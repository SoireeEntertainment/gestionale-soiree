import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computePrimaryAssigneeId,
  computeReassignedAssigneeIds,
  newlyAddedAssigneeIds,
} from './work-assignee-reassign'

describe('singola assegnazione', () => {
  it('sposta A → B lasciando solo B', () => {
    const next = computeReassignedAssigneeIds({
      currentAssigneeIds: ['cristian'],
      fromUserId: 'cristian',
      toUserId: 'daniele',
    })
    assert.deepEqual(next, ['daniele'])
    assert.equal(
      computePrimaryAssigneeId({
        currentPrimaryId: 'cristian',
        fromUserId: 'cristian',
        toUserId: 'daniele',
        nextAssigneeIds: next,
      }),
      'daniele'
    )
  })
})

describe('assegnazioni multiple', () => {
  it('Cristian + Davide, drag Cristian → Daniele → Daniele + Davide', () => {
    const next = computeReassignedAssigneeIds({
      currentAssigneeIds: ['cristian', 'davide'],
      fromUserId: 'cristian',
      toUserId: 'daniele',
    })
    assert.deepEqual(new Set(next), new Set(['daniele', 'davide']))
    assert.ok(!next.includes('cristian'))
  })

  it('non perde gli altri assegnatari quando il primario non è chi viene trascinato', () => {
    const next = computeReassignedAssigneeIds({
      currentAssigneeIds: ['davide', 'cristian', 'enrico'],
      fromUserId: 'cristian',
      toUserId: 'daniele',
    })
    assert.deepEqual(new Set(next), new Set(['davide', 'enrico', 'daniele']))
    assert.equal(
      computePrimaryAssigneeId({
        currentPrimaryId: 'davide',
        fromUserId: 'cristian',
        toUserId: 'daniele',
        nextAssigneeIds: next,
      }),
      'davide'
    )
  })
})

describe('drag verso utente già assegnato', () => {
  it('non crea duplicati e rimuove solo la colonna di partenza', () => {
    const next = computeReassignedAssigneeIds({
      currentAssigneeIds: ['cristian', 'davide'],
      fromUserId: 'cristian',
      toUserId: 'davide',
    })
    assert.deepEqual(next, ['davide'])
  })
})

describe('notifiche solo ai nuovi assegnatari', () => {
  it('notifica B se non era già assegnato', () => {
    assert.deepEqual(newlyAddedAssigneeIds(['cristian', 'davide'], ['daniele', 'davide']), ['daniele'])
  })

  it('non notifica chi era già assegnato', () => {
    assert.deepEqual(newlyAddedAssigneeIds(['cristian', 'davide'], ['davide']), [])
  })
})
