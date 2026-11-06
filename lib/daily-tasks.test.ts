import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  UNIVERSE_ORBIT_PAGE_SIZE,
  applyTaskToUniverseNode,
  assertReactivateAfterContact,
  defaultNextReactivateDate,
  filterUniverseNodesByQuery,
  getContactUniverseStatus,
  getEffectiveTaskStatus,
  paginateUniverseNodes,
  quickReactivateDate,
  resolveNextReactivateAt,
  sanitizeNextReactivateForForm,
  shouldReactivateContactTask,
  sortDailyTasksByDueDateDesc,
  type UniverseClientNode,
} from './daily-tasks'

describe('universo clienti rosso/verde', () => {
  const today = '2026-11-06'

  it('OPEN contact → rosso', () => {
    assert.equal(
      getContactUniverseStatus(
        { type: 'CONTACT_CLIENT', status: 'OPEN', nextReactivateAt: null },
        today
      ),
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

describe('riattivazione dal contatto effettivo', () => {
  it('SETTIMANA PROSSIMA = +7 dal giorno del contatto (non dalla creazione task)', () => {
    // Task creata il 6, contatto il 10 → settimana prossima = 17
    const contactDate = '2026-11-10'
    assert.equal(quickReactivateDate('next_week', contactDate), '2026-11-17')
    assert.equal(defaultNextReactivateDate(contactDate), '2026-11-17')
    assert.notEqual(defaultNextReactivateDate(contactDate), '2026-11-13')
  })

  it('quick actions dal contatto', () => {
    assert.equal(quickReactivateDate('tomorrow', '2026-11-10'), '2026-11-11')
    assert.equal(quickReactivateDate('next_month', '2026-11-10'), '2026-12-10')
  })

  it('scelta esplicita prevale sul default', () => {
    assert.equal(resolveNextReactivateAt('2026-11-10', '2026-11-20'), '2026-11-20')
    assert.equal(resolveNextReactivateAt('2026-11-10', null), '2026-11-17')
    assert.equal(resolveNextReactivateAt('2026-11-10', undefined), '2026-11-17')
  })

  it('rifiuta riattivazione non successiva al contatto', () => {
    assert.throws(() => assertReactivateAfterContact('2026-11-10', '2026-11-10'))
    assert.throws(() => assertReactivateAfterContact('2026-11-10', '2026-11-09'))
    assert.throws(() => resolveNextReactivateAt('2026-11-10', '2026-11-05'))
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

describe('universo oltre 28 clienti', () => {
  it('pagina tutti i nodi senza perderli', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      clientId: `c${i}`,
      clientName: `Cliente ${String(i).padStart(2, '0')}`,
      status: i % 2 === 0 ? ('red' as const) : ('green' as const),
      taskId: `t${i}`,
      lastContactedAt: null,
      nextReactivateAt: null,
      dueDate: null,
    }))
    assert.equal(nodes.length > UNIVERSE_ORBIT_PAGE_SIZE, true)
    const page0 = paginateUniverseNodes(nodes, 0)
    const page1 = paginateUniverseNodes(nodes, 1)
    assert.equal(page0.pageNodes.length, UNIVERSE_ORBIT_PAGE_SIZE)
    assert.equal(page1.pageNodes.length, 40 - UNIVERSE_ORBIT_PAGE_SIZE)
    assert.equal(page0.totalPages, 2)
    const ids = new Set([...page0.pageNodes, ...page1.pageNodes].map((n) => n.clientId))
    assert.equal(ids.size, 40)
  })

  it('ricerca rende raggiungibili clienti fuori dalla prima orbita', () => {
    const nodes: UniverseClientNode[] = Array.from({ length: 35 }, (_, i) => ({
      clientId: `c${i}`,
      clientName: i === 33 ? 'Zeta Special' : `Cliente ${i}`,
      status: 'neutral',
      taskId: null,
      lastContactedAt: null,
      nextReactivateAt: null,
      dueDate: null,
    }))
    const found = filterUniverseNodesByQuery(nodes, 'zeta')
    assert.equal(found.length, 1)
    assert.equal(found[0].clientName, 'Zeta Special')
  })
})

describe('sync locale universo senza hard refresh', () => {
  it('completamento → verde; riapertura effettiva → rosso', () => {
    const node: UniverseClientNode = {
      clientId: 'c1',
      clientName: 'Acme',
      status: 'red',
      taskId: 't1',
      lastContactedAt: null,
      nextReactivateAt: null,
      dueDate: '2026-11-06',
    }
    const afterComplete = applyTaskToUniverseNode(node, {
      id: 't1',
      clientId: 'c1',
      type: 'CONTACT_CLIENT',
      status: 'DONE',
      lastContactedAt: '2026-11-10',
      nextReactivateAt: '2026-11-17',
      dueDate: '2026-11-06',
    }, '2026-11-10')
    assert.equal(afterComplete.status, 'green')
    assert.equal(afterComplete.nextReactivateAt, '2026-11-17')

    const afterLazy = applyTaskToUniverseNode(afterComplete, {
      id: 't1',
      clientId: 'c1',
      type: 'CONTACT_CLIENT',
      status: 'DONE',
      lastContactedAt: '2026-11-10',
      nextReactivateAt: '2026-11-17',
      dueDate: '2026-11-06',
    }, '2026-11-17')
    assert.equal(afterLazy.status, 'red')
  })
})

describe('toggle contatto DONE → OPEN → DONE', () => {
  const today = '2026-11-06'
  const preservedContact = '2026-11-04'

  /** Simula payload server di reopenDailyTask / markClientNeedsContact. */
  function reopenPayload(lastContactedAt: string) {
    return {
      id: 't1',
      clientId: 'c1',
      type: 'CONTACT_CLIENT' as const,
      status: 'OPEN' as const,
      lastContactedAt,
      nextReactivateAt: null as string | null,
      dueDate: today,
      completedAt: null as string | null,
    }
  }

  /** Simula payload server di completeDailyTask / markClientContacted. */
  function completePayload(contactDate: string, nextReactivateAt: string) {
    return {
      id: 't1',
      clientId: 'c1',
      type: 'CONTACT_CLIENT' as const,
      status: 'DONE' as const,
      lastContactedAt: contactDate,
      nextReactivateAt,
      dueDate: today,
      completedAt: `${contactDate}T12:00:00.000Z`,
    }
  }

  it('verde → rosso preserva lastContactedAt e azzera nextReactivateAt', () => {
    const green: UniverseClientNode = {
      clientId: 'c1',
      clientName: 'oneforall',
      status: 'green',
      taskId: 't1',
      lastContactedAt: preservedContact,
      nextReactivateAt: '2026-11-11',
      dueDate: '2026-11-04',
    }

    const reopened = reopenPayload(preservedContact)
    assert.equal(reopened.lastContactedAt, preservedContact)
    assert.equal(reopened.nextReactivateAt, null)
    assert.equal(reopened.status, 'OPEN')
    assert.equal(reopened.dueDate, today)
    assert.equal(reopened.completedAt, null)

    const afterReopen = applyTaskToUniverseNode(green, reopened, today)
    assert.equal(afterReopen.status, 'red')
    assert.equal(afterReopen.lastContactedAt, preservedContact)
    assert.equal(afterReopen.nextReactivateAt, null)
    assert.equal(afterReopen.taskId, 't1')
  })

  it('rosso → verde aggiorna lastContactedAt e nextReactivateAt sullo stesso tracker', () => {
    const red: UniverseClientNode = {
      clientId: 'c1',
      clientName: 'oneforall',
      status: 'red',
      taskId: 't1',
      lastContactedAt: preservedContact,
      nextReactivateAt: null,
      dueDate: today,
    }

    const newContact = today
    const next = defaultNextReactivateDate(newContact)
    const completed = completePayload(newContact, next)
    assert.equal(completed.id, 't1')
    assert.notEqual(completed.lastContactedAt, preservedContact)
    assert.equal(completed.lastContactedAt, newContact)
    assert.equal(completed.nextReactivateAt, next)

    const afterComplete = applyTaskToUniverseNode(red, completed, today)
    assert.equal(afterComplete.status, 'green')
    assert.equal(afterComplete.lastContactedAt, newContact)
    assert.equal(afterComplete.nextReactivateAt, next)
    assert.equal(afterComplete.taskId, 't1')
  })

  it('ciclo completo DONE → OPEN → DONE senza duplicare tracker', () => {
    let node: UniverseClientNode = {
      clientId: 'c1',
      clientName: 'oneforall',
      status: 'green',
      taskId: 't1',
      lastContactedAt: preservedContact,
      nextReactivateAt: '2026-11-11',
      dueDate: '2026-11-04',
    }

    node = applyTaskToUniverseNode(node, reopenPayload(preservedContact), today)
    assert.equal(node.status, 'red')
    assert.equal(node.lastContactedAt, preservedContact)
    assert.equal(node.taskId, 't1')

    const secondContact = '2026-11-06'
    const secondNext = '2026-11-13'
    node = applyTaskToUniverseNode(node, completePayload(secondContact, secondNext), today)
    assert.equal(node.status, 'green')
    assert.equal(node.lastContactedAt, secondContact)
    assert.equal(node.nextReactivateAt, secondNext)
    assert.equal(node.taskId, 't1')
  })
})

describe('sanitizeNextReactivateForForm', () => {
  it('sostituisce next <= lastContactedAt con default successivo', () => {
    const sanitized = sanitizeNextReactivateForForm({
      lastContactedAt: '2026-11-04',
      nextReactivateAt: '2026-11-04',
      today: '2026-11-06',
    })
    assert.equal(sanitized, defaultNextReactivateDate('2026-11-04'))
    assert.equal(sanitized > '2026-11-04', true)
  })

  it('conserva next valida successiva al contatto', () => {
    assert.equal(
      sanitizeNextReactivateForForm({
        lastContactedAt: '2026-11-04',
        nextReactivateAt: '2026-11-18',
        today: '2026-11-06',
      }),
      '2026-11-18'
    )
  })
})

describe('semantica task / duplicati / permessi (contratti puri)', () => {
  it('task generica ammette cliente opzionale (modello DTO)', () => {
    const general = {
      type: 'GENERAL' as const,
      clientId: null as string | null,
      title: 'Chiamare fornitore',
    }
    assert.equal(general.clientId, null)
    const withClient = { ...general, clientId: 'c1' }
    assert.equal(withClient.clientId, 'c1')
  })

  it('chiave logica anti-duplicato contatto = userId+clientId', () => {
    const key = (userId: string, clientId: string) => `${userId}::${clientId}`
    const a = key('u1', 'c1')
    const b = key('u1', 'c1')
    const c = key('u1', 'c2')
    assert.equal(a, b)
    assert.notEqual(a, c)
  })
})

describe('migrazione promemoria (contratto dati)', () => {
  it('dueDate migrata è tecnica; completedAt storico non va inventato da createdAt', () => {
    // Contratto: i record migrated_* non devono usare createdAt come completedAt affidabile.
    const migrated = {
      id: 'migrated_abc',
      createdAt: '2025-01-01T10:00:00.000Z',
      completedAt: null as string | null,
      dueDateTechnical: true,
    }
    assert.equal(migrated.completedAt, null)
    assert.equal(migrated.dueDateTechnical, true)
    assert.notEqual(migrated.completedAt, migrated.createdAt)
  })
})
