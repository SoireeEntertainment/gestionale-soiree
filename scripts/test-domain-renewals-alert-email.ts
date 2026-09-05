/**
 * Test unitari (senza DB) per email alert rinnovi + colonna Data fatturazione.
 * Esegui: npx tsx scripts/test-domain-renewals-alert-email.ts
 */

import { buildDomainRenewalsAlertEmail, type DomainRenewalAlertItem } from '../lib/domain-renewals-alert'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const withBilling: DomainRenewalAlertItem = {
  clientId: 'c1',
  clientName: 'Legnami Tavella',
  domain: 'legnamitavella.com',
  renewalDate: new Date('2026-09-12T00:00:00.000Z'),
  billingDate: new Date('2027-07-31T00:00:00.000Z'),
  renewalId: 'r1',
}

const withoutBilling: DomainRenewalAlertItem = {
  clientId: 'c2',
  clientName: 'Cliente Test',
  domain: 'esempio.it',
  renewalDate: new Date('2026-10-01T00:00:00.000Z'),
  billingDate: null,
  renewalId: 'r2',
}

const { html, text, subject } = buildDomainRenewalsAlertEmail([withBilling, withoutBilling])

assert(subject === 'Alert rinnovi domini - prossimi 2 mesi', 'subject unchanged')
assert(html.includes('Data fatturazione'), 'html has billing header')
assert(html.includes('Data rinnovo'), 'html has renewal header')
assert(text.includes('Legnami Tavella | legnamitavella.com | 12/09/2026 | 31/07/2027'), 'text row A')
assert(text.includes('Cliente Test | esempio.it | 01/10/2026 | —'), 'text row B null billing')
assert(html.includes('31/07/2027'), 'html shows billing date')
assert(html.includes('—'), 'html shows em dash for null billing')
assert(html.includes('max-width:820px'), 'layout widened for 4 columns')

console.log('OK — test email alert billing date passati')
