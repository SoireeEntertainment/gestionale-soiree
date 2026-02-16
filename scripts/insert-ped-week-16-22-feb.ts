/**
 * Inserisce nel PED di Davide Piccolo i lavori della settimana 16-22 Feb 2026 (dallo screenshot).
 * Esegui con: DATABASE_URL="file:/path/to/dev.db" npx tsx scripts/insert-ped-week-16-22-feb.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const YEAR = 2026
const TASKS: { clientName: string; title: string; description?: string; day: number }[] = [
  { clientName: 'Carlomagno', title: 'Check Weglot', day: 16 },
  { clientName: 'Morasia', title: 'Foto + check Lubenda', day: 17 },
  { clientName: 'Agricooltur', title: 'Yoast premium, SEO, WPLM', day: 18 },
  { clientName: 'Varca', title: 'Badge p promo 50 anni', day: 19 },
  { clientName: 'Macelleria 106', title: 'SEO', day: 20 },
]

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

function findClient(name: string, clients: { id: string; name: string }[]): { id: string; name: string } | null {
  const n = normalize(name)
  const exact = clients.find((c) => normalize(c.name) === n)
  if (exact) return exact
  const contains = clients.find((c) => normalize(c.name).includes(n) || n.includes(normalize(c.name)))
  return contains ?? null
}

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: 'Davide Piccolo' } },
        { email: 'davide@soiree.studio' },
      ],
    },
  })
  if (!user) throw new Error('Utente Davide Piccolo non trovato')

  const allClients = await prisma.client.findMany({ select: { id: true, name: true } })
  const created: string[] = []
  const skipped: string[] = []

  for (const task of TASKS) {
    const client = findClient(task.clientName, allClients)
    if (!client) {
      skipped.push(`${task.clientName}: ${task.title}`)
      continue
    }
    const dateStr = `${YEAR}-02-${String(task.day).padStart(2, '0')}`
    const existing = await prisma.pedItem.findFirst({
      where: {
        ownerId: user.id,
        clientId: client.id,
        date: new Date(dateStr + 'T00:00:00.000Z'),
        title: task.title,
      },
    })
    if (existing) {
      console.log('Già presente:', client.name, task.title)
      continue
    }
    await prisma.pedItem.create({
      data: {
        ownerId: user.id,
        clientId: client.id,
        date: new Date(dateStr + 'T00:00:00.000Z'),
        kind: 'WORK_TASK',
        type: 'OTHER',
        title: task.title,
        description: task.description ?? null,
        priority: 'MEDIUM',
        status: 'TODO',
      },
    })
    created.push(`${client.name}: ${task.title} (${dateStr})`)
  }

  console.log('Inseriti:', created.length)
  created.forEach((c) => console.log('  ', c))
  if (skipped.length) {
    console.log('Non inseriti (cliente non trovato):', skipped)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
