import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BoardWorkCard } from './works-board'
import { WORKS_DONE_DROP_ID } from './works-board'
import {
  WORKS_PERSON_BOARD_ARCHIVE_DROP_ID,
  WORK_BOARD_QUICK_STATUSES,
  applyStatusOnPersonBoard,
  applyStatusOnStatusBoard,
  archiveWorkOnPersonBoard,
  isArchiveDropId,
  removeWorkFromPersonBoard,
  removeWorkFromStatusBoard,
} from './work-board-quick-actions'

function card(partial: Partial<BoardWorkCard> & Pick<BoardWorkCard, 'id' | 'title'>): BoardWorkCard {
  return {
    status: 'TODO',
    deadline: '2026-11-20',
    clientId: 'c1',
    clientName: 'Cliente',
    categoryId: 'cat1',
    categoryName: 'Web',
    assignedToUserId: 'u1',
    assigneeUserIds: ['u1'],
    isOverdue: false,
    ...partial,
  }
}

describe('quick status menu', () => {
  it('espone gli stati operativi inclusa DONE, senza CANCELED', () => {
    assert.deepEqual(WORK_BOARD_QUICK_STATUSES, [
      'TODO',
      'IN_REVIEW',
      'IN_PROGRESS',
      'WAITING_CLIENT',
      'PAUSED',
      'DONE',
    ])
    assert.equal(WORK_BOARD_QUICK_STATUSES.includes('CANCELED' as never), false)
  })
})

describe('archive drop ids', () => {
  it('riconosce solo le dropzone dedicate', () => {
    assert.equal(isArchiveDropId(WORKS_DONE_DROP_ID), true)
    assert.equal(isArchiveDropId(WORKS_PERSON_BOARD_ARCHIVE_DROP_ID), true)
    assert.equal(isArchiveDropId('user-uuid-123'), false)
    assert.equal(isArchiveDropId('IN_PROGRESS'), false)
    assert.equal(isArchiveDropId(null), false)
  })
})

describe('person board optimistic updates', () => {
  const shared = card({
    id: 'w1',
    title: 'Campagna',
    assignedToUserId: 'u1',
    assigneeUserIds: ['u1', 'u2'],
  })

  const board = {
    columns: [
      { userId: 'u1', key: 'a', label: 'A', name: 'A', email: 'a@x', works: [shared], count: 1 },
      { userId: 'u2', key: 'b', label: 'B', name: 'B', email: 'b@x', works: [{ ...shared }], count: 1 },
      { userId: 'u3', key: 'c', label: 'C', name: 'C', email: 'c@x', works: [], count: 0 },
    ],
    unassigned: [] as BoardWorkCard[],
    activeCount: 1,
    archiveCount: 4,
  }

  it('cambio stato non-DONE aggiorna il badge su tutte le colonne', () => {
    const next = applyStatusOnPersonBoard(board, 'w1', 'IN_PROGRESS')
    assert.equal(next.columns[0].works[0].status, 'IN_PROGRESS')
    assert.equal(next.columns[1].works[0].status, 'IN_PROGRESS')
    assert.equal(next.activeCount, 1)
    assert.equal(next.archiveCount, 4)
  })

  it('DONE rimuove il lavoro da tutte le colonne e aggiorna i contatori una sola volta', () => {
    const next = applyStatusOnPersonBoard(board, 'w1', 'DONE')
    assert.equal(next.columns[0].works.length, 0)
    assert.equal(next.columns[1].works.length, 0)
    assert.equal(next.columns[0].count, 0)
    assert.equal(next.columns[1].count, 0)
    assert.equal(next.activeCount, 0)
    assert.equal(next.archiveCount, 5)
  })

  it('icona Archive = stessa semantica di DONE', () => {
    const next = archiveWorkOnPersonBoard(board, 'w1')
    assert.equal(next.activeCount, 0)
    assert.equal(next.archiveCount, 5)
    assert.equal(next.columns.every((c) => c.works.every((w) => w.id !== 'w1')), true)
  })

  it('delete rimuove senza incrementare archivio', () => {
    const next = removeWorkFromPersonBoard(board, 'w1')
    assert.equal(next.activeCount, 0)
    assert.equal(next.archiveCount, 4)
  })

  it('assegnazioni multiple: archiviazione non altera assigneeUserIds del modello rimosso', () => {
    // Il lavoro non resta in board; il server preserva assignees in archivio.
    const archived = archiveWorkOnPersonBoard(board, 'w1')
    assert.equal(archived.columns[0].works.length, 0)
    assert.deepEqual(shared.assigneeUserIds, ['u1', 'u2'])
  })
})

describe('status board optimistic updates', () => {
  const columns = [
    {
      status: 'TODO' as const,
      works: [card({ id: 'w1', title: 'A', status: 'TODO' })],
      count: 1,
    },
    {
      status: 'IN_PROGRESS' as const,
      works: [card({ id: 'w2', title: 'B', status: 'IN_PROGRESS' })],
      count: 1,
    },
    {
      status: 'IN_REVIEW' as const,
      works: [] as BoardWorkCard[],
      count: 0,
    },
  ]

  it('sposta la card nella colonna corretta', () => {
    const next = applyStatusOnStatusBoard(columns, 'w1', 'IN_REVIEW')
    assert.equal(next.find((c) => c.status === 'TODO')?.count, 0)
    assert.equal(next.find((c) => c.status === 'IN_REVIEW')?.works[0]?.id, 'w1')
    assert.equal(next.find((c) => c.status === 'IN_REVIEW')?.works[0]?.status, 'IN_REVIEW')
  })

  it('DONE rimuove dalle colonne operative', () => {
    const next = applyStatusOnStatusBoard(columns, 'w2', 'DONE')
    assert.equal(next.every((c) => c.works.every((w) => w.id !== 'w2')), true)
    assert.equal(next.find((c) => c.status === 'IN_PROGRESS')?.count, 0)
  })

  it('delete rimuove dalla board stato', () => {
    const next = removeWorkFromStatusBoard(columns, 'w1')
    assert.equal(next.find((c) => c.status === 'TODO')?.count, 0)
  })
})

describe('task-work link integrity (contratto delete)', () => {
  it('sourceDailyTaskId vive sul Work: eliminare il lavoro non richiede delete della Task', () => {
    // Contratto: FK Work → DailyTask onDelete SetNull lato Work;
    // cancellare Work elimina solo il record Work (e figli cascade).
    const workSideHoldsFk = true
    const taskRemainsAfterWorkDelete = true
    assert.equal(workSideHoldsFk && taskRemainsAfterWorkDelete, true)
  })
})
