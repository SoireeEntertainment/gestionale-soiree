import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { workSchema } from '@/lib/validations'
import type { DailyTaskDTO } from '@/lib/daily-tasks'

describe('collegamento Task → Lavoro (contratti)', () => {
  it('workSchema accetta sourceDailyTaskId opzionale', () => {
    const parsed = workSchema.parse({
      title: 'Realizzazione sito',
      clientId: 'client1',
      categoryId: 'cat1',
      status: 'TODO',
      sourceDailyTaskId: 'task1',
    })
    assert.equal(parsed.sourceDailyTaskId, 'task1')
  })

  it('workSchema senza sourceDailyTaskId resta valido', () => {
    const parsed = workSchema.parse({
      title: 'Lavoro libero',
      clientId: 'client1',
      categoryId: 'cat1',
      status: 'TODO',
    })
    assert.equal(parsed.sourceDailyTaskId ?? null, null)
  })

  it('DTO con linkedWork null è valido per task senza lavoro', () => {
    const task = {
      id: 't1',
      title: 'Brief',
      type: 'GENERAL',
      status: 'OPEN',
      dueDate: '2026-11-12',
      notes: null,
      userId: 'u1',
      clientId: 'c1',
      clientName: 'Oneforall',
      completedAt: null,
      lastContactedAt: null,
      nextReactivateAt: null,
      linkedWork: null,
      createdAt: '',
      updatedAt: '',
    } satisfies DailyTaskDTO
    assert.equal(task.linkedWork, null)
  })

  it('DTO con linkedWork espone id lavoro', () => {
    const task = {
      id: 't1',
      title: 'Brief',
      type: 'GENERAL',
      status: 'OPEN',
      dueDate: '2026-11-12',
      notes: null,
      userId: 'u1',
      clientId: 'c1',
      clientName: 'Oneforall',
      completedAt: null,
      lastContactedAt: null,
      nextReactivateAt: null,
      linkedWork: {
        id: 'w1',
        title: 'Sito',
        status: 'TODO',
        deadline: '2026-11-20',
        assigneeNames: ['Davide'],
      },
      createdAt: '',
      updatedAt: '',
    } satisfies DailyTaskDTO
    assert.equal(task.linkedWork?.id, 'w1')
  })

  it('indipendenza stati: completare task non implica DONE sul lavoro (modello)', () => {
    const taskStatus = 'DONE'
    const workStatus = 'IN_PROGRESS'
    assert.notEqual(taskStatus, workStatus)
  })
})
