import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDateItFromYmd, resolveItalianDatePhrase } from '@/lib/assistant-v2/dates'

describe('assistant-v2 dates Europe/Rome', () => {
  const today = '2026-11-06' // venerdì

  it('oggi / domani / dopodomani', () => {
    assert.equal(resolveItalianDatePhrase('oggi', { today }).date, '2026-11-06')
    assert.equal(resolveItalianDatePhrase('domani', { today }).date, '2026-11-07')
    assert.equal(resolveItalianDatePhrase('dopodomani', { today }).date, '2026-11-08')
  })

  it('venerdì prossimo dopo un venerdì → +7', () => {
    // oggi è venerdì: "venerdì" senza "prossimo" punta al prossimo venerdì (non oggi)
    assert.equal(resolveItalianDatePhrase('venerdì', { today }).date, '2026-11-13')
  })

  it('lunedì / tra sette giorni / 20 novembre', () => {
    assert.equal(resolveItalianDatePhrase('lunedì', { today }).date, '2026-11-09')
    assert.equal(resolveItalianDatePhrase('tra 7 giorni', { today }).date, '2026-11-13')
    assert.equal(resolveItalianDatePhrase('20 novembre', { today }).date, '2026-11-20')
  })

  it('format IT', () => {
    assert.equal(formatDateItFromYmd('2026-11-07'), '07/11/2026')
  })
})
