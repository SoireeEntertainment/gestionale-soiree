/**
 * Aggiunge i clienti al PED di Daniele Mirante (contenuti/mese).
 * - In locale: npx tsx scripts/setup-ped-daniele.ts  (usa .env)
 * - Per Vercel/produzione: DATABASE_URL="postgres://..." npx tsx scripts/setup-ped-daniele.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PED_CLIENTS: { name: string; contentsPerWeek: number }[] = [
  { name: 'Shoro', contentsPerWeek: 12 },
  { name: 'Arneis', contentsPerWeek: 12 },
  { name: 'V-Mat', contentsPerWeek: 12 },
  { name: 'Fifty', contentsPerWeek: 8 },
  { name: 'Wokoza', contentsPerWeek: 12 },
  { name: 'Carmatennis', contentsPerWeek: 4 },
  { name: 'MC Dental', contentsPerWeek: 12 },
  { name: 'Centro Ortopedico Sanitario', contentsPerWeek: 8 },
  { name: 'Linked', contentsPerWeek: 4 },
  { name: 'Black Rose', contentsPerWeek: 8 },
  { name: 'Premiere', contentsPerWeek: 2 },
  { name: 'Antico Forno 2.0', contentsPerWeek: 8 },
  { name: 'Oneforall', contentsPerWeek: 10 },
  { name: 'The room pn', contentsPerWeek: 10 },
  { name: 'Cantarella', contentsPerWeek: 8 },
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function findBestClientMatch(
  wantedName: string,
  clients: { id: string; name: string }[]
): { id: string; name: string } | null {
  const wanted = normalize(wantedName)
  const exact = clients.find((c) => normalize(c.name) === wanted)
  if (exact) return exact
  const contains = clients.find((c) => normalize(c.name).includes(wanted) || wanted.includes(normalize(c.name)))
  if (contains) return contains
  const partial = clients.find((c) => {
    const cn = normalize(c.name)
    const words = wanted.split(/\s+/)
    return words.every((w) => w.length < 2 || cn.includes(w))
  })
  return partial ?? null
}

async function main() {
  let user = await prisma.user.findFirst({ where: { email: 'daniele@soiree.it' } })
  if (!user) {
    user = await prisma.user.findFirst({
      where: { name: { contains: 'Daniele Mirante' } },
    })
  }
  if (!user) {
    throw new Error('Utente daniele@soiree.it / "Daniele Mirante" non trovato nel database.')
  }
  console.log('Utente trovato:', user.name, user.email, '(id:', user.id, ')')

  const allClients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  console.log('Clienti nel DB:', allClients.length)

  let added = 0

  for (const { name: wantedName, contentsPerWeek } of PED_CLIENTS) {
    let client = findBestClientMatch(wantedName, allClients)
    if (!client) {
      const created = await prisma.client.create({
        data: { name: wantedName },
        select: { id: true, name: true },
      })
      allClients.push(created)
      client = created
      console.log('  Creato cliente:', wantedName)
    }
    await prisma.pedClientSetting.upsert({
      where: {
        ownerId_clientId: { ownerId: user.id, clientId: client.id },
      },
      update: { contentsPerWeek },
      create: {
        ownerId: user.id,
        clientId: client.id,
        contentsPerWeek,
      },
    })
    console.log('  PED:', client.name, '->', contentsPerWeek, 'contenuti/mese')
    added++
  }

  console.log('\n✅ PED aggiornato:', added, 'clienti assegnati a', user.name)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
