/**
 * Elimina dal database (e da Clerk) tutti gli utenti tranne i 5 autorizzati.
 * Utenti da mantenere: Alessia Pilutzu, Cristian Palazzolo, Daniele Mirante, Davide Piccolo, Enrico Cairoli
 * (email: alessia@soiree.it, cristian.palazzolo@soiree.it, daniele@soiree.it, davide@soiree.it, enrico@soiree.it)
 *
 * Esecuzione: DATABASE_URL="..." CLERK_SECRET_KEY="..." npx tsx scripts/cleanup-users.ts
 * Oppure: npx tsx scripts/cleanup-users.ts  (usa .env)
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KEEP_EMAILS = [
  'alessia@soiree.it',
  'cristian.palazzolo@soiree.it',
  'daniele@soiree.it',
  'davide@soiree.it',
  'enrico@soiree.it',
]

async function deleteUserFromClerk(clerkId: string): Promise<boolean> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    console.warn('  CLERK_SECRET_KEY non impostata, skip eliminazione da Clerk')
    return false
  }
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const t = await res.text()
      console.warn('  Clerk DELETE fallito:', res.status, t)
      return false
    }
    return true
  } catch (e) {
    console.warn('  Clerk DELETE errore:', e)
    return false
  }
}

async function main() {
  const all = await prisma.user.findMany({ orderBy: { email: 'asc' } })
  const toDelete = all.filter((u) => !KEEP_EMAILS.includes(u.email))
  const toKeep = all.filter((u) => KEEP_EMAILS.includes(u.email))

  console.log('Utenti da mantenere:', toKeep.length)
  toKeep.forEach((u) => console.log('  -', u.email, u.name))
  console.log('\nUtenti da eliminare (DB + Clerk):', toDelete.length)
  toDelete.forEach((u) => console.log('  -', u.email, u.name, u.clerkId ? `(Clerk: ${u.clerkId})` : ''))

  if (toDelete.length === 0) {
    console.log('\nNessun utente da eliminare.')
    return
  }

  if (process.env.CONFIRM_CLEANUP !== '1') {
    console.log('\nPer eseguire davvero l\'eliminazione imposta CONFIRM_CLEANUP=1')
    console.log('Esempio: CONFIRM_CLEANUP=1 npx tsx scripts/cleanup-users.ts')
    return
  }

  console.log('\nProcedo con l\'eliminazione...')
  for (const user of toDelete) {
    if (user.clerkId) {
      const ok = await deleteUserFromClerk(user.clerkId)
      if (ok) console.log('  Clerk eliminato:', user.email)
    }
    await prisma.user.delete({ where: { id: user.id } })
    console.log('  DB eliminato:', user.email, user.name)
  }
  console.log('\n✅ Pulizia completata.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
