/**
 * Integrazione Prisma: create → delete → verify (task usa titolo marker, nessun dato utente reale).
 * Esegui: npx tsx scripts/test-daily-task-delete.ts
 */
import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const MARKER = `__test_delete_daily_task_${Date.now()}__`

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) {
    console.error('SKIP: nessun utente in DB per il test')
    process.exit(0)
  }

  const created = await prisma.dailyTask.create({
    data: {
      title: MARKER,
      type: 'GENERAL',
      status: 'OPEN',
      dueDate: new Date(),
      userId: user.id,
      notes: 'integration-test-only',
    },
  })
  console.log('created', created.id)

  await prisma.dailyTask.delete({ where: { id: created.id } })
  const after = await prisma.dailyTask.findUnique({ where: { id: created.id } })
  if (after) throw new Error('Task ancora presente dopo delete')
  console.log('deleted ok')

  // Idempotenza P2025
  try {
    await prisma.dailyTask.delete({ where: { id: created.id } })
    throw new Error('Atteso P2025 al secondo delete')
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
      throw error
    }
    console.log('P2025 ok (already deleted)')
  }

  // CONTACT_CLIENT usa un client esistente se presente
  const client = await prisma.client.findFirst({ select: { id: true, name: true } })
  if (client) {
    const contact = await prisma.dailyTask.create({
      data: {
        title: `${MARKER}_contact`,
        type: 'CONTACT_CLIENT',
        status: 'DONE',
        dueDate: new Date(),
        userId: user.id,
        clientId: client.id,
        lastContactedAt: new Date(),
        nextReactivateAt: new Date(Date.now() + 7 * 86400000),
        notes: 'integration-test-only',
      },
    })
    const clientBefore = await prisma.client.findUnique({ where: { id: client.id } })
    await prisma.dailyTask.delete({ where: { id: contact.id } })
    const clientAfter = await prisma.client.findUnique({ where: { id: client.id } })
    if (!clientBefore || !clientAfter) throw new Error('Cliente sparito')
    if (clientAfter.id !== clientBefore.id) throw new Error('Cliente alterato')
    console.log('CONTACT_CLIENT delete ok, client preserved', client.name)
  } else {
    console.log('SKIP CONTACT_CLIENT: nessun cliente')
  }

  console.log('ALL PASS')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
