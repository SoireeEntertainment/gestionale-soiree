/**
 * Inserisce/aggiorna i 5 utenti Soirëe nel DB.
 * Uso: npm run db:seed   (legge DATABASE_URL da .env)
 * oppure: DATABASE_URL="postgresql://..." npx tsx scripts/seed-users.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const users = [
  { name: 'Davide Piccolo', email: 'davide@soiree.it', role: 'ADMIN' as const },
  { name: 'Alessia Pilutzu', email: 'alessia@soiree.it', role: 'ADMIN' as const },
  { name: 'Cristian Palazzolo', email: 'cristian.palazzolo@soiree.it', role: 'ADMIN' as const },
  { name: 'Daniele Mirante', email: 'daniele@soiree.it', role: 'ADMIN' as const },
  { name: 'Enrico Cairoli', email: 'enrico@soiree.it', role: 'ADMIN' as const },
]

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || (!url.startsWith('postgresql://') && !url.startsWith('postgres://'))) {
    console.error('Imposta DATABASE_URL con URL PostgreSQL (es. in .env o: DATABASE_URL="postgresql://..." npx tsx scripts/seed-users.ts)')
    process.exit(1)
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, isActive: true },
      create: user,
    })
    console.log('OK:', user.email)
  }
  console.log('Utenti inseriti/aggiornati:', users.length)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
