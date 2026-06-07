/**
 * Genera checklist mancanti per tutti i lavori con categoria ma senza step.
 * Uso: npx tsx scripts/generate-missing-work-steps.ts
 */
import { PrismaClient } from '@prisma/client'
import { getDefaultStepTitlesForCategory } from '../lib/work-step-templates'

const prisma = new PrismaClient()

async function main() {
  const works = await prisma.work.findMany({
    where: { steps: { none: {} } },
    include: { category: { select: { name: true } } },
  })

  let created = 0
  let skipped = 0

  for (const work of works) {
    const titles = getDefaultStepTitlesForCategory(work.category.name)
    if (titles.length === 0) {
      skipped++
      continue
    }

    await prisma.workStep.createMany({
      data: titles.map((title, index) => ({
        workId: work.id,
        title,
        sortOrder: index,
        status: 'TODO',
      })),
    })
    created++
    console.log(`✓ ${work.title} (${work.category.name}) — ${titles.length} step`)
  }

  console.log(`\nCompletato: ${created} lavori aggiornati, ${skipped} senza template.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
