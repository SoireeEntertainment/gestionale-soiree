import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultNextReactivateDate,
  getContactUniverseStatus,
  getEffectiveTaskStatus,
  quickReactivateDate,
  shouldReactivateContactTask,
  sortDailyTasksByDueDateDesc,
} from './daily-tasks'

describe('universo clienti rosso/verde', () => {
  const today = '2026-11-06'

  it('OPEN contact → rosso', () => {
    assert.equal(
      getContactUniverseStatus({ type: 'CONTACT_CLIENT', status: 'OPEN', nextReactivateAt: null }, today),
      'red'
    )
  })

  it('DONE con riattivazione futura → verde', () => {
    assert.equal(
      getContactUniverseStatus(
        { type: 'CONTACT_CLIENT', status: 'DONE', nextReactivateAt: '2026-11-13' },
        today
      ),
      'green'
    )
  })

  it('DONE con riattivazione scaduta → rosso (lazy)', () => {
    assert.equal(
      getContactUniverseStatus(
        { type: 'CONTACT_CLIENT', status: 'DONE', nextReactivateAt: '2026-11-01' },
        today
      ),
      'red'
    )
    assert.equal(
      shouldReactivateContactTask(
        { type: 'CONTACT_CLIENT', status: 'DONE', nextReactivateAt: '2026-11-01' },
        today
      ),
      true
    )
    assert.equal(
      getEffectiveTaskStatus(
        { type: 'CONTACT_CLIENT', status: 'DONE', nextReactivateAt: '2026-11-01' },
        today
      ),
      'OPEN'
    )
  })

  it('senza task contatto → neutro', () => {
    assert.equal(getContactUniverseStatus(null, today), 'neutral')
  })
})

describe('riattivazione configurabile', () => {
  it('default settimanale', () => {
    assert.equal(defaultNextReactivateDate('2026-11-06'), '2026-11-13')
  })

  it('quick actions', () => {
    assert.equal(quickReactivateDate('tomorrow', '2026-11-06'), '2026-11-07')
    assert.equal(quickReactivateDate('next_week', '2026-11-06'), '2026-11-13')
    assert.equal(quickReactivateDate('next_month', '2026-11-06'), '2026-12-06')
  })
})

describe('ordinamento scadenze decrescente', () => {
  it('ordina dueDate DESC', () => {
    const sorted = sortDailyTasksByDueDateDesc([
      { id: '1', title: 'A', dueDate: '2026-11-01' },
      { id: '2', title: 'B', dueDate: '2026-11-20' },
      { id: '3', title: 'C', dueDate: '2026-11-09' },
    ])
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['2', '3', '1']
    )
  })
})
