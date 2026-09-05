/**
 * Test unitari (senza DB) per dominio dedicato + compatibilità legacy.
 * Esegui: npx tsx scripts/test-renewal-domain.ts
 */

import {
  isDomainRenewalRecord,
  normalizeDomainInput,
  parseDomainFromServiceName,
  resolveRenewalDomain,
  serviceNameSuggestsDomain,
} from '../lib/domain-renewal-utils'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
  }
}

// Normalizzazione
assertEq(normalizeDomainInput('https://www.legnamitavella.com/'), 'www.legnamitavella.com', 'strip protocol+slash')
assertEq(normalizeDomainInput('legnamitavella.com'), 'legnamitavella.com', 'plain domain')
assertEq(normalizeDomainInput('  Esempio.IT  '), 'esempio.it', 'trim+lower')
assertEq(normalizeDomainInput('esempio.it/path'), null, 'reject path')
assertEq(normalizeDomainInput('not a domain'), null, 'reject spaces')
assertEq(normalizeDomainInput(''), null, 'empty')
assertEq(normalizeDomainInput(null), null, 'null')

// Test A — legacy Dominio: esempio.it, domain null → alert
{
  const r = { serviceName: 'Dominio: esempio.it', domain: null }
  assert(isDomainRenewalRecord(r), 'A is domain record')
  assertEq(resolveRenewalDomain(r), 'esempio.it', 'A resolve')
}

// Test B — nuovo formato Dominio + domain field
{
  const r = { serviceName: 'Dominio', domain: 'legnamitavella.com' }
  assert(isDomainRenewalRecord(r), 'B is domain record')
  assertEq(resolveRenewalDomain(r), 'legnamitavella.com', 'B resolve')
  assert(serviceNameSuggestsDomain(r.serviceName), 'B suggests domain')
}

// Test C — servizio generico con domain
{
  const r = { serviceName: 'Hosting', domain: 'esempio.it' }
  assert(isDomainRenewalRecord(r), 'C is domain record')
  assertEq(resolveRenewalDomain(r), 'esempio.it', 'C resolve')
}

// Test D — non dominio
{
  const r = { serviceName: 'Iubenda', domain: null }
  assert(!isDomainRenewalRecord(r), 'D not domain record')
  assertEq(resolveRenewalDomain(r), null, 'D no domain')
}

// Campo domain ha priorità sul legacy
{
  const r = { serviceName: 'Dominio: vecchio.it', domain: 'nuovo.it' }
  assertEq(resolveRenewalDomain(r), 'nuovo.it', 'field wins over legacy')
}

// Legacy parser variants
assertEq(parseDomainFromServiceName('dominio: esempio.it'), 'esempio.it', 'legacy colon lower')
assertEq(parseDomainFromServiceName('Dominio:   esempio.it'), 'esempio.it', 'legacy colon spaces')
assertEq(parseDomainFromServiceName('Dominio - esempio.it'), 'esempio.it', 'legacy dash')
assertEq(parseDomainFromServiceName('Dominio'), null, 'Dominio alone has no parseable domain')

// Obbligatorietà condizionale (logica UI/server)
assert(serviceNameSuggestsDomain('Dominio'), 'Dominio requires domain')
assert(serviceNameSuggestsDomain('Dominio sito'), 'Dominio sito requires domain')
assert(serviceNameSuggestsDomain('Dominio principale'), 'Dominio principale requires domain')
assert(serviceNameSuggestsDomain('Dominio: esempio.it'), 'Dominio: … requires domain')
assert(!serviceNameSuggestsDomain('Iubenda'), 'Iubenda optional domain')
assert(!serviceNameSuggestsDomain('Weglot'), 'Weglot optional domain')
assert(!serviceNameSuggestsDomain('Redirect'), 'Redirect optional domain')
assert(!serviceNameSuggestsDomain('Meta Ads'), 'Meta Ads optional domain')

// Legacy prefill: Dominio: esempio.it + domain null → parser
assertEq(
  parseDomainFromServiceName('Dominio: esempio.it'),
  'esempio.it',
  'legacy open-edit prefill'
)

console.log('OK — tutti i test dominio renewals passati')
