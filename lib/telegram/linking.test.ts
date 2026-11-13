import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashLinkToken, generateLinkToken } from '@/lib/telegram/security'
import { expandOrdinalReferences } from '@/lib/telegram/context'

describe('telegram linking rules', () => {
  it('token monouso basati su hash, non username', () => {
    const a = generateLinkToken()
    const b = generateLinkToken()
    assert.notEqual(a, b)
    assert.notEqual(hashLinkToken(a), hashLinkToken(b))
  })

  it('non associa per email nel messaggio (nessuna logica email)', () => {
    // Il messaggio può contenere un'email: expandOrdinal non la usa come identità
    const r = expandOrdinalReferences('sono davide@soiree.it', [])
    assert.equal(r.text, 'sono davide@soiree.it')
    assert.equal(r.resolved, undefined)
  })
})
