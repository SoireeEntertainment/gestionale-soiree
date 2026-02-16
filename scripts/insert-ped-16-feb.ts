/**
 * Inserisce le 11 task verdi (NOT_URGENT) del 16 feb 2026 per Davide Piccolo, tutte DONE.
 * Esegui: npx tsx scripts/insert-ped-16-feb.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DAVIDE_ID = 'cmlpbws660000g0uyhfrtmz8g'
const DATE_16_FEB = '2026-02-16'

const TASKS: { clientName: string; title: string; clientId?: string }[] = [
  { clientName: 'Luxury', title: 'promo 2 feb + caricare contenuti su tik tok' },
  { clientName: 'Grand & Gross', title: 'p, e, s TF 27.02' },
  { clientName: 'Oneforall', title: 'togliere da sito promo san valentino' },
  { clientName: 'Agricooltur', title: 'p linkedin + script reel' },
  { clientName: 'Urbancooltur', title: 'lubenda' },
  { clientName: 'Inecotech', title: 'wip page' },
  { clientName: 'Moramarco', title: 'wip page' },
  { clientName: 'H2Color', title: 'r raccolto' },
  { clientName: 'Girasoli', title: 'car colpo' },
  { clientName: 'Cristiano Scano', title: 'r work' },
  { clientName: 'Pasta Berruto', title: 'rispondere a mail' },
]

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } })
  const byName = new Map(clients.map((c) => [c.name, c.id]))

  const date = new Date(DATE_16_FEB + 'T12:00:00.000Z')
  let inserted = 0
  let skipped = 0

  for (const task of TASKS) {
    const clientId = task.clientId ?? byName.get(task.clientName)
    if (!clientId) {
      console.warn('Cliente non trovato:', task.clientName)
      skipped++
      continue
    }
    await prisma.pedItem.create({
      data: {
        ownerId: DAVIDE_ID,
        assignedToUserId: DAVIDE_ID,
        clientId,
        date,
        kind: 'CONTENT',
        type: 'OTHER',
        title: task.title,
        priority: 'NOT_URGENT',
        status: 'DONE',
        isExtra: false,
        sortOrder: 0,
      },
    })
    inserted++
  }

  console.log(`Inserite ${inserted} task, saltate ${skipped}.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
