import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveOriginalDeadline, sameDeadline } from './work-due-date-history'

describe('confronto scadenze', () => {
  it('non registra eventi se la data non cambia', () => {
    const a = new Date('2026-11-10T00:00:00.000Z')
    const b = new Date('2026-11-10T00:00:00.000Z')
    assert.equal(sameDeadline(a, b), true)
    assert.equal(sameDeadline(null, null), true)
    assert.equal(sameDeadline(a, null), false)
    assert.equal(sameDeadline(a, new Date('2026-11-11T00:00:00.000Z')), false)
  })
})

describe('originalDeadline immutabile', () => {
  it('alla prima valorizzazione salva original e marca history come originale', () => {
    const next = new Date('2026-12-01T00:00:00.000Z')
    const result = resolveOriginalDeadline({
      currentOriginal: null,
      previousDeadline: null,
      newDeadline: next,
    })
    assert.equal(result.originalDeadline?.toISOString(), next.toISOString())
    assert.equal(result.isOriginalHistory, true)
  })

  it('non sovrascrive originalDeadline dopo la prima valorizzazione', () => {
    const original = new Date('2026-12-01T00:00:00.000Z')
    const result = resolveOriginalDeadline({
      currentOriginal: original,
      previousDeadline: original,
      newDeadline: new Date('2026-12-15T00:00:00.000Z'),
    })
    assert.equal(result.originalDeadline?.toISOString(), original.toISOString())
    assert.equal(result.isOriginalHistory, false)
  })
})

describe('transazione simulata scadenza + storico', () => {
  it('se lo storico fallisce, anche la scadenza deve poter essere annullata insieme', async () => {
    const state = {
      deadline: null as Date | null,
      originalDeadline: null as Date | null,
      history: [] as Array<{ previous: Date | null; next: Date | null }>,
      committed: false,
    }

    async function applyAtomic(newDeadline: Date, failHistory = false) {
      const snapshot = structuredClone(state)
      try {
        const previous = state.deadline
        if (sameDeadline(previous, newDeadline)) return
        const resolved = resolveOriginalDeadline({
          currentOriginal: state.originalDeadline,
          previousDeadline: previous,
          newDeadline,
        })
        state.deadline = newDeadline
        if (!state.originalDeadline) state.originalDeadline = resolved.originalDeadline
        if (failHistory) throw new Error('history write failed')
        state.history.push({ previous, next: newDeadline })
        state.committed = true
      } catch (error) {
        state.deadline = snapshot.deadline
        state.originalDeadline = snapshot.originalDeadline
        state.history = snapshot.history
        state.committed = false
        throw error
      }
    }

    const d1 = new Date('2026-12-01T00:00:00.000Z')
    await applyAtomic(d1)
    assert.equal(state.deadline?.toISOString(), d1.toISOString())
    assert.equal(state.history.length, 1)

    const d2 = new Date('2026-12-20T00:00:00.000Z')
    await assert.rejects(() => applyAtomic(d2, true))
    assert.equal(state.deadline?.toISOString(), d1.toISOString())
    assert.equal(state.history.length, 1)
    assert.equal(state.committed, false)
  })

  it('aggiornamenti concorrenti usano il valore DB corrente come previousDeadline', () => {
    // Simula due writer: entrambi leggono D0, il secondo vede D1 dopo il primo commit.
    const d0 = new Date('2026-12-01T00:00:00.000Z')
    const d1 = new Date('2026-12-10T00:00:00.000Z')
    const d2 = new Date('2026-12-20T00:00:00.000Z')
    let dbDeadline: Date | null = d0
    const history: Array<{ previous: Date | null; next: Date | null }> = []

    function writer(next: Date) {
      const previous = dbDeadline
      if (sameDeadline(previous, next)) return
      dbDeadline = next
      history.push({ previous, next })
    }

    writer(d1)
    writer(d2)

    assert.equal(history.length, 2)
    assert.equal(history[0]?.previous?.toISOString(), d0.toISOString())
    assert.equal(history[0]?.next?.toISOString(), d1.toISOString())
    assert.equal(history[1]?.previous?.toISOString(), d1.toISOString())
    assert.equal(history[1]?.next?.toISOString(), d2.toISOString())
  })
})
