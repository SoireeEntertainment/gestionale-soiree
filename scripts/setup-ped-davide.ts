/**
 * Aggiunge i clienti al PED di Davide Piccolo (contenuti/mese).
 * - In locale: npx tsx scripts/setup-ped-davide.ts  (usa .env)
 * - Per Vercel/produzione: copia DATABASE_URL da Vercel (Environment Variables)
 *   poi: DATABASE_URL="postgres://..." npx tsx scripts/setup-ped-davide.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PED_CLIENTS: { name: string; contentsPerWeek: number }[] = [
  { name: 'Grand & Gross', contentsPerWeek: 8 },
  { name: 'Quality Burger', contentsPerWeek: 8 },
  { name: 'Marmor Stone', contentsPerWeek: 0 },
  { name: 'H2 Color', contentsPerWeek: 12 },
  { name: "L'Estetica", contentsPerWeek: 8 },
  { name: 'Girasoli', contentsPerWeek: 12 },
  { name: 'Doors Design', contentsPerWeek: 8 },
  { name: 'Pin & Roll', contentsPerWeek: 8 },
  { name: 'Moschiano Crew', contentsPerWeek: 8 },
  { name: 'Varca', contentsPerWeek: 6 },
  { name: 'Costantini Automobili', contentsPerWeek: 6 },
  { name: 'Anna & Anna', contentsPerWeek: 8 },
  { name: 'Agricooltur+Urbancooltur (Grafiche e pubb)', contentsPerWeek: 12 },
  { name: 'Jumbo Sport', contentsPerWeek: 8 },
  { name: 'Luxury', contentsPerWeek: 8 },
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
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: 'Davide Piccolo' } },
        { email: 'davide@soiree.it' },
        { email: 'davide@soiree.studio' },
      ],
    },
  })
  if (!user) {
    throw new Error('Utente "Davide Piccolo" non trovato nel database.')
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
