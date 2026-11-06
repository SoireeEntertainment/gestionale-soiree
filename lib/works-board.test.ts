import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeIsOverdue,
  getDeadlineUrgency,
  sortArchiveWorks,
  sortBoardWorksByDeadline,
  toDeadlineDateOnlyKey,
  WORKS_STATUS_BOARD_COLUMNS,
} from './works-board'

describe('sortBoardWorksByDeadline', () => {
  it('ordina scaduti → oggi → futuri → null; tie-break titolo e id', () => {
    const works = [
      { id: 'e', title: 'Zebra', deadline: null },
      { id: 'd', title: 'Lontano', deadline: '2026-11-20' },
      { id: 'c', title: 'Medio', deadline: '2026-11-09' },
      { id: 'b', title: 'Presto', deadline: '2026-11-05' },
      { id: 'a', title: 'Vecchio', deadline: '2026-11-01' },
      { id: 'a2', title: 'Alfa', deadline: '2026-11-01' },
    ]

    const sorted = sortBoardWorksByDeadline(works)
    assert.deepEqual(
      sorted.map((w) => w.id),
      ['a2', 'a', 'b', 'c', 'd', 'e']
    )
  })

  it('accetta Date noon UTC senza shift di giorno', () => {
    const works = [
      { id: '2', title: 'B', deadline: new Date('2026-11-05T12:00:00.000Z') },
      { id: '1', title: 'A', deadline: new Date('2026-11-01T12:00:00.000Z') },
      { id: '3', title: 'C', deadline: null },
    ]
    const sorted = sortBoardWorksByDeadline(works)
    assert.deepEqual(
      sorted.map((w) => w.id),
      ['1', '2', '3']
    )
  })
})

describe('toDeadlineDateOnlyKey', () => {
  it('estrae YYYY-MM-DD da stringhe e Date DB', () => {
    assert.equal(toDeadlineDateOnlyKey('2026-11-09'), '2026-11-09')
    assert.equal(toDeadlineDateOnlyKey('2026-11-09T12:00:00.000Z'), '2026-11-09')
    assert.equal(toDeadlineDateOnlyKey(new Date('2026-11-09T12:00:00.000Z')), '2026-11-09')
    assert.equal(toDeadlineDateOnlyKey(null), null)
  })
})

describe('urgenza scadenze', () => {
  const today = '2026-11-06'

  it('classifica overdue / today / soon / later / none', () => {
    assert.equal(getDeadlineUrgency('2026-11-01', today), 'overdue')
    assert.equal(getDeadlineUrgency('2026-11-06', today), 'today')
    assert.equal(getDeadlineUrgency('2026-11-08', today), 'soon')
    assert.equal(getDeadlineUrgency('2026-11-09', today), 'soon')
    assert.equal(getDeadlineUrgency('2026-11-20', today), 'later')
    assert.equal(getDeadlineUrgency(null, today), 'none')
  })

  it('isOverdue ignora DONE e CANCELED', () => {
    assert.equal(computeIsOverdue('2026-11-01', 'TODO', today), true)
    assert.equal(computeIsOverdue('2026-11-01', 'DONE', today), false)
    assert.equal(computeIsOverdue('2026-11-01', 'CANCELED', today), false)
  })
})

describe('archiviazione via status DONE', () => {
  it('le colonne operative non includono DONE', () => {
    assert.equal(WORKS_STATUS_BOARD_COLUMNS.includes('DONE'), false)
    assert.deepEqual(WORKS_STATUS_BOARD_COLUMNS, [
      'TODO',
      'IN_REVIEW',
      'IN_PROGRESS',
      'WAITING_CLIENT',
      'PAUSED',
    ])
  })

  it('sort archive è stabile (deadline DESC, null last)', () => {
    const works = [
      { id: '1', title: 'A', deadline: '2026-11-01' },
      { id: '2', title: 'B', deadline: '2026-11-20' },
      { id: '3', title: 'C', deadline: null },
    ]
    const sorted = sortArchiveWorks(works)
    assert.deepEqual(
      sorted.map((w) => w.id),
      ['2', '1', '3']
    )
  })
})

describe('riattivazione semantica', () => {
  it('DONE → TODO preserva deadline e assegnatari nel modello card', () => {
    const archived = {
      id: 'w1',
      title: 'Brief',
      status: 'DONE',
      deadline: '2026-11-09',
      assignedToUserId: 'u1',
      assigneeUserIds: ['u1', 'u2'],
    }
    const reactivated = { ...archived, status: 'TODO' }
    assert.equal(reactivated.status, 'TODO')
    assert.equal(reactivated.deadline, archived.deadline)
    assert.deepEqual(reactivated.assigneeUserIds, ['u1', 'u2'])
  })
})
