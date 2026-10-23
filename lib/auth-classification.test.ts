import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyClerkBackendFailure,
  classifyProviderSession,
  isAuthorizedAppUser,
  isDatabaseError,
  safeInternalPath,
  sanitizeCode,
  sanitizeRequestId,
} from './auth-classification'

describe('sessione valida', () => {
  it('non reindirizza se Clerk ha verificato uno userId', () => {
    const decision = classifyProviderSession({
      userId: 'user_123',
      reason: 'session-token-expired',
      thrown: false,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'authenticated')
  })
})

describe('errore temporaneo Clerk', () => {
  it('non tratta un’eccezione di auth() come logout', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'auth_status_missing',
      thrown: true,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'temporary')
    assert.equal(decision.kind === 'temporary' && decision.event, 'AUTH_PROVIDER_TRANSIENT_ERROR')
  })

  it('non tratta il fallimento di refresh di rete come sessione scaduta', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-expired-refresh-fetch-error',
      thrown: false,
      recoveryAttempted: true,
    })
    assert.equal(decision.kind, 'temporary')
  })

  it('non tratta JWK, timeout e 5xx come utente disconnesso', () => {
    for (const reason of ['jwk-remote-failed-to-load', 'timeout', 'unexpected-error']) {
      const decision = classifyProviderSession({
        userId: null,
        reason,
        thrown: false,
        recoveryAttempted: false,
      })
      assert.equal(decision.kind, 'temporary', reason)
    }
  })

  it('un codice di refresh sconosciuto resta un errore gestito', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-expired-refresh-some_new_code',
      thrown: false,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'temporary')
    assert.equal(decision.kind === 'temporary' && decision.event, 'AUTH_UNCLASSIFIED_ERROR')
  })
})

describe('database temporaneamente non raggiungibile', () => {
  it('riconosce gli errori Prisma di connessione', () => {
    assert.equal(isDatabaseError({ name: 'PrismaClientInitializationError', message: 'Can\'t reach database server' }), true)
    assert.equal(isDatabaseError({ code: 'P1001', message: 'db down' }), true)
    assert.equal(isDatabaseError(new Error('business rule failed')), false)
  })
})

describe('sessione scaduta', () => {
  it('un token scaduto su una server action chiede il recupero handshake, non il login immediato', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-expired-refresh-non-eligible-non-get',
      thrown: false,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'recover')
  })

  it('dopo un recupero già tentato la sessione scaduta va al login', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-expired-refresh-non-eligible-no-cookie',
      thrown: false,
      recoveryAttempted: true,
    })
    assert.deepEqual(decision, {
      kind: 'sign-in',
      event: 'AUTH_SESSION_EXPIRED',
      code: 'session-token-expired-refresh-non-eligible-no-cookie',
    })
  })

  it('l’assenza reale di cookie va subito al login', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-and-uat-missing',
      thrown: false,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'sign-in')
    assert.equal(decision.kind === 'sign-in' && decision.event, 'AUTH_SESSION_MISSING')
  })
})

describe('sessione revocata', () => {
  it('session_token_consumed non rilancia l’handshake', () => {
    const decision = classifyProviderSession({
      userId: null,
      reason: 'session-token-expired-refresh-session_token_consumed',
      thrown: false,
      recoveryAttempted: false,
    })
    assert.equal(decision.kind, 'sign-in')
    assert.equal(decision.kind === 'sign-in' && decision.event, 'AUTH_SESSION_REVOKED')
  })
})

describe('Clerk Backend API', () => {
  it('non classifica 429, 5xx, timeout o 401 come utente inesistente', () => {
    assert.equal(classifyClerkBackendFailure({ status: 429, errors: [{ code: 'too_many_requests' }] }), 'transient')
    assert.equal(classifyClerkBackendFailure({ status: 503 }), 'transient')
    assert.equal(classifyClerkBackendFailure({ name: 'TimeoutError', message: 'timeout' }), 'transient')
    assert.equal(classifyClerkBackendFailure({ status: 401 }), 'transient')
    assert.equal(classifyClerkBackendFailure({ code: 'ECONNRESET', message: 'socket hang up' }), 'transient')
  })

  it('classifica solo il 404 come utente Clerk inesistente', () => {
    assert.equal(classifyClerkBackendFailure({ status: 404, errors: [{ code: 'resource_not_found' }] }), 'not_found')
  })
})

describe('autorizzazioni applicative', () => {
  it('mantiene ADMIN e AGENTE attivi e blocca gli altri', () => {
    assert.equal(isAuthorizedAppUser({ isActive: true, role: 'ADMIN' }), true)
    assert.equal(isAuthorizedAppUser({ isActive: true, role: 'AGENTE' }), true)
    assert.equal(isAuthorizedAppUser({ isActive: false, role: 'AGENTE' }), false)
    assert.equal(isAuthorizedAppUser({ isActive: true, role: 'GUEST' }), false)
    assert.equal(isAuthorizedAppUser(null), false)
  })
})

describe('percorso di ritorno', () => {
  it('accetta solo path interni e blocca open redirect e pagine auth', () => {
    assert.equal(safeInternalPath('/clients'), '/clients')
    assert.equal(safeInternalPath('/works/abc'), '/works/abc')
    assert.equal(safeInternalPath('https://evil.example/phish'), '/dashboard')
    assert.equal(safeInternalPath('//evil.example'), '/dashboard')
    assert.equal(safeInternalPath('/sign-in'), '/dashboard')
    assert.equal(safeInternalPath('/ripristino-sessione'), '/dashboard')
  })
})

describe('log privi di segreti', () => {
  it('scarta cookie, token e caratteri non previsti', () => {
    assert.equal(sanitizeCode('session-token-expired-refresh-fetch-error'), 'session-token-expired-refresh-fetch-error')
    assert.equal(sanitizeCode('Bearer secret.token'), 'Bearer_secret.token')
    assert.equal(sanitizeRequestId('req/with space'), 'reqwithspace')
    assert.equal(sanitizeRequestId('__session=abc'), '__sessionabc')
  })
})
