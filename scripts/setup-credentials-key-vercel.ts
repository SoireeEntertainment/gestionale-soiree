/**
 * Genera CREDENTIALS_ENCRYPTION_KEY e la aggiunge al progetto Vercel (Production).
 * Richiede: npx vercel login e progetto già linkato (vercel link).
 *
 * Esecuzione: npx tsx scripts/setup-credentials-key-vercel.ts
 */

import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'

const key = randomBytes(32).toString('hex')

console.log('Chiave generata:', key.slice(0, 16) + '...')
console.log('Aggiunta a Vercel (Production)...')

try {
  execSync(`echo "${key}" | npx vercel env add CREDENTIALS_ENCRYPTION_KEY production`, {
    stdio: 'inherit',
    shell: '/bin/sh',
  })
  console.log('')
  console.log('Variabile CREDENTIALS_ENCRYPTION_KEY aggiunta. Esegui un Redeploy per applicarla.')
} catch (e) {
  console.error('')
  console.error('Impossibile aggiungere la variabile via CLI. Aggiungila manualmente:')
  console.error('1. Vercel Dashboard → progetto → Settings → Environment Variables')
  console.error('2. Name: CREDENTIALS_ENCRYPTION_KEY')
  console.error('3. Value (copia qui sotto):')
  console.error('')
  console.error(key)
  console.error('')
  process.exit(1)
}
