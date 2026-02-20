/**
 * Lista tutti gli utenti presenti su Clerk.
 * Richiede CLERK_SECRET_KEY in .env o .env.local.
 *
 * Esecuzione: npx tsx scripts/list-clerk-users.ts
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Carica .env.local se esiste (override)
function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (existsSync(path)) {
    const content = readFileSync(path, 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
}
loadEnvLocal()

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY

async function listClerkUsers() {
  if (!CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY non trovata. Impostala in .env o .env.local')
    process.exit(1)
  }

  const users: Array<{
    id: string
    email_addresses?: Array<{ email_address: string; id: string }>
    first_name?: string
    last_name?: string
    created_at?: number
  }> = []
  let offset = 0
  const limit = 500

  while (true) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!res.ok) {
      console.error('Errore Clerk API:', res.status, await res.text())
      process.exit(1)
    }
    const json = (await res.json()) as {
      data: typeof users
      total_count?: number
    }
    users.push(...(json.data || []))
    if (!json.data?.length || json.data.length < limit) break
    offset += limit
  }

  console.log('Utenti su Clerk:', users.length)
  console.log('')
  users.forEach((u, i) => {
    const email = u.email_addresses?.[0]?.email_address ?? '(nessuna email)'
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '(nessun nome)'
    console.log(`${i + 1}. ${name} | ${email} | id: ${u.id}`)
  })
}

listClerkUsers().catch((e) => {
  console.error(e)
  process.exit(1)
})
