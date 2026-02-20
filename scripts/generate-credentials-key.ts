/**
 * Genera una chiave sicura per CREDENTIALS_ENCRYPTION_KEY (cifratura credenziali clienti).
 * Usa questa chiave in produzione (Vercel: Project → Settings → Environment Variables).
 *
 * Esecuzione: npx tsx scripts/generate-credentials-key.ts
 */

import { randomBytes } from 'node:crypto'

const key = randomBytes(32).toString('hex')

console.log('Chiave generata (64 caratteri hex):')
console.log('')
console.log(key)
console.log('')
console.log('--- Attivazione in produzione (Vercel) ---')
console.log('1. Vercel Dashboard → il tuo progetto → Settings → Environment Variables')
console.log('2. Aggiungi variabile:')
console.log('   Name:  CREDENTIALS_ENCRYPTION_KEY')
console.log('   Value: (incolla la chiave sopra)')
console.log('   Environment: Production (e opzionalmente Preview se usi branch)')
console.log('3. Ridistribuisci il progetto (Redeploy) per applicare la variabile.')
console.log('')
console.log('Importante: usa la stessa chiave per tutti gli ambienti che condividono lo stesso database,')
console.log('altrimenti le credenziali cifrate in un ambiente non saranno decifrabili nell\'altro.')
