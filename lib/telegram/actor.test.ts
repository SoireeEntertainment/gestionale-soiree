import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getRequestActor, runWithRequestActorAsync } from '@/lib/request-actor'
import type { CurrentUser } from '@/lib/auth-dev'

describe('request actor ALS', () => {
  it('espone attore solo dentro runWithRequestActor', async () => {
    assert.equal(getRequestActor(), null)
    const user: CurrentUser = {
      id: 'u-tg',
      userId: 'u-tg',
      name: 'Tg',
      email: 'tg@soiree.it',
      role: 'ADMIN',
    }
    const inside = await runWithRequestActorAsync(user, async () => getRequestActor())
    assert.equal(inside?.id, 'u-tg')
    assert.equal(getRequestActor(), null)
  })
})
