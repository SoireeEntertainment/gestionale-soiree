/**
 * Corregge il PED di Davide Piccolo per la settimana 16-22 Feb 2026.
 * Rimuove i task esistenti in quel range e inserisce quelli dalla tabella (colonne Lun=16 -> Ven=20).
 * Esegui con: DATABASE_URL="file:/path/to/dev.db" npx tsx scripts/fix-ped-week-16-22-feb.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const YEAR = 2026

// Colonna = giorno: Lun 16, Mar 17, Mer 18, Gio 19, Ven 20. Sab/Dom e Extra vuoti.
const TASKS: { clientName: string; title: string; day: number }[] = [
  // Lunedì 16 Feb
  { clientName: 'Luxury', title: 'promo 2 feb', day: 16 },
  { clientName: 'Grand & Gross', title: 'p, e, s TF 27.02', day: 16 },
  { clientName: 'Oneforall', title: 'togliere da sito', day: 16 },
  { clientName: 'Oneforall', title: 'promo san valentino', day: 16 },
  { clientName: 'Rinlux', title: 'setup lubenda', day: 16 },
  { clientName: "L'Estetica", title: 'varianti grafiche', day: 16 },
  { clientName: 'Agricooltur', title: 'vedi ped + script reel', day: 16 },
  { clientName: 'Urbancooltur', title: 'lubenda', day: 16 },
  { clientName: 'Moschiano', title: 'r valeria + r olio', day: 16 },
  { clientName: 'Anna & Anna', title: 'r profili', day: 16 },
  { clientName: 'Madre', title: 'script', day: 16 },
  { clientName: 'Black Rose', title: 'p', day: 16 },
  // Martedì 17 Feb
  { clientName: 'Costantini Automobili', title: 'p', day: 17 },
  { clientName: 'Varca', title: 'p', day: 17 },
  { clientName: 'Luxury', title: 'r ricetta', day: 17 },
  { clientName: 'Doors Design', title: 'p finanziamento agos', day: 17 },
  { clientName: 'Oneforall', title: 'r viral', day: 17 },
  // Mercoledì 18 Feb
  { clientName: 'Pin & Roll', title: 'P, e, s Karaoke', day: 18 },
  { clientName: 'Costantini Automobili', title: 'p', day: 18 },
  { clientName: 'Scano', title: 'r Al', day: 18 },
  // Giovedì 19 Feb
  { clientName: 'The room', title: 'r', day: 19 },
  { clientName: 'Linked', title: 'r', day: 19 },
  { clientName: 'Varca', title: 'p', day: 19 },
  { clientName: 'FisioSport', title: 'r. Dolore Lombare pt.2', day: 19 },
  { clientName: 'DUC', title: 'essenza donna', day: 19 },
  // Venerdì 20 Feb
  { clientName: 'Carlomagno', title: 'check weglot', day: 20 },
  { clientName: 'Morasia', title: 'foto + check lubenda', day: 20 },
  { clientName: 'Agricooltur', title: 'yoast premium, SEO, wplm', day: 20 },
  { clientName: 'Varca', title: 'badge p promo 50 anni', day: 20 },
  { clientName: 'Macelleria 106', title: 'SEO', day: 20 },
]

const ALIASES: Record<string, string> = {
  'Cost Auto': 'Costantini Automobili',
  'OFA': 'Oneforall',
  'Pineroll': 'Pin & Roll',
  'GG': 'Grand & Gross',
  'Moschiano Crew': 'Moschiano',
  'Macelleria': 'Macelleria 106',
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

function findClient(name: string, clients: { id: string; name: string }[]): { id: string; name: string } | null {
  const resolved = ALIASES[name] ?? name
  const n = normalize(resolved)
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

  const start = new Date(`${YEAR}-02-16T00:00:00.000Z`)
  const end = new Date(`${YEAR}-02-22T23:59:59.999Z`)

  const deleted = await prisma.pedItem.deleteMany({
    where: {
      ownerId: user.id,
      date: { gte: start, lte: end },
    },
  })
  console.log('Rimossi', deleted.count, 'task esistenti nella settimana 16-22 Feb')

  const allClients = await prisma.client.findMany({ select: { id: true, name: true } })
  const inserted: string[] = []
  const skipped: string[] = []

  for (const task of TASKS) {
    const client = findClient(task.clientName, allClients)
    if (!client) {
      skipped.push(`${task.clientName}: ${task.title}`)
      continue
    }
    const dateStr = `${YEAR}-02-${String(task.day).padStart(2, '0')}`
    await prisma.pedItem.create({
      data: {
        ownerId: user.id,
        clientId: client.id,
        date: new Date(dateStr + 'T00:00:00.000Z'),
        kind: 'WORK_TASK',
        type: 'OTHER',
        title: task.title,
        priority: 'MEDIUM',
        status: 'TODO',
        isExtra: false,
      },
    })
    inserted.push(`${task.day}/02 ${client.name}: ${task.title}`)
  }

  console.log('Inseriti:', inserted.length)
  inserted.forEach((c) => console.log('  ', c))
  if (skipped.length) {
    console.log('Non inseriti (cliente non trovato):', skipped.length)
    skipped.forEach((s) => console.log('  ', s))
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
