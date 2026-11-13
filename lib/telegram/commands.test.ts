import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseTelegramCommand } from '@/lib/telegram/commands'
import { expandOrdinalReferences } from '@/lib/telegram/context'
import { formatAssistantForTelegram, helpText } from '@/lib/telegram/format'
import { romeHourMinute, romeWeekday } from '@/lib/telegram/digest'
import type { ListedContextItem } from '@/lib/telegram/types'

describe('telegram commands', () => {
  it('/oggi e /settimana producono testo naturale', () => {
    const oggi = parseTelegramCommand('/oggi')
    assert.equal(oggi.type, 'natural')
    if (oggi.type === 'natural') assert.match(oggi.text, /oggi/i)

    const sett = parseTelegramCommand('/settimana')
    assert.equal(sett.type, 'natural')
  })

  it('/start con token', () => {
    const s = parseTelegramCommand('/start abcTOKEN')
    assert.equal(s.type, 'start')
    if (s.type === 'start') assert.equal(s.token, 'abcTOKEN')
  })

  it('/aiuto', () => {
    assert.equal(parseTelegramCommand('/aiuto').type, 'help')
    assert.match(helpText(), /Soirëe/)
  })
})

describe('telegram contesto ordinale', () => {
  const listed: ListedContextItem[] = [
    { index: 1, kind: 'ped', id: 'p1', label: 'Reel Oneforall', clientName: 'Oneforall' },
    { index: 2, kind: 'ped', id: 'p2', label: 'Post Berruto', clientName: 'Pasta Berruto' },
  ]

  it('risolve "il secondo"', () => {
    const r = expandOrdinalReferences('Il secondo l\'ho fatto.', listed)
    assert.ok(r.resolved)
    assert.equal(r.resolved?.id, 'p2')
    assert.match(r.text, /p2/)
  })

  it('non risolve senza elenco', () => {
    const r = expandOrdinalReferences('Il secondo l\'ho fatto.', [])
    assert.equal(r.resolved, undefined)
    assert.equal(r.text, 'Il secondo l\'ho fatto.')
  })

  it('segnala ambiguo se indice fuori range', () => {
    const r = expandOrdinalReferences('Il quinto è fatto.', listed)
    assert.equal(r.ambiguous, true)
  })
})

describe('telegram format', () => {
  it('non emette JSON grezzo e aggiunge pulsanti conferma', () => {
    const formatted = formatAssistantForTelegram({
      reply: 'Vuoi segnare il Reel come Fatto?',
      mode: 'needs_confirmation',
      threadId: 't1',
      pendingConfirmationId: 'pend1',
      cards: [
        {
          type: 'confirmation',
          pendingId: 'pend1',
          toolName: 'toggle_ped_done',
          preview: {
            title: 'Segna come fatto',
            summary: 'Reel Oneforall',
            fields: [{ label: 'Cliente', value: 'Oneforall' }],
          },
        },
      ],
    })
    assert.doesNotMatch(formatted.text, /\{"ok"/)
    assert.ok(formatted.replyMarkup?.inline_keyboard?.[0]?.length === 2)
  })

  it('numera elenco PED', () => {
    const formatted = formatAssistantForTelegram({
      reply: 'Ecco il PED di oggi.',
      mode: 'answer',
      threadId: 't1',
      cards: [
        {
          type: 'list',
          title: 'PED oggi',
          items: [
            { id: 'a', kind: 'ped', label: 'Reel Oneforall', meta: 'DA_FARE' },
            { id: 'b', kind: 'ped', label: 'Post Doors', meta: 'FATTO' },
          ],
        },
      ],
    })
    assert.match(formatted.text, /1\. Reel Oneforall/)
    assert.equal(formatted.listedItems[1].id, 'b')
  })
})

describe('telegram digest time Europe/Rome', () => {
  it('calcola weekday e ora senza crash', () => {
    const wd = romeWeekday(new Date('2026-11-13T07:00:00.000Z')) // venerdì Rome
    assert.ok(wd >= 1 && wd <= 7)
    const hm = romeHourMinute(new Date('2026-11-13T07:00:00.000Z'))
    assert.ok(hm.hour >= 0 && hm.hour <= 23)
    assert.match(hm.dateKey, /^\d{4}-\d{2}-\d{2}$/)
  })
})
