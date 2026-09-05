/**
 * Backfill opzionale e sicuro del campo `domain` su ClientRenewal.
 *
 * - trova record con serviceName tipo "Dominio: esempio.it"
 * - se domain è null, estrae e valorizza domain
 * - NON cambia serviceName
 * - NON sovrascrive domain già valorizzato
 *
 * NON eseguire automaticamente in produzione.
 * Uso:
 *   npx tsx scripts/backfill-renewal-domains.ts
 *   npx tsx scripts/backfill-renewal-domains.ts --dry-run
 */

import { PrismaClient } from '@prisma/client'
import { parseDomainFromServiceName } from '../lib/domain-renewal-utils'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const rows = await prisma.clientRenewal.findMany({
    where: { domain: null },
    select: { id: true, serviceName: true, domain: true, clientId: true },
  })

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    if (row.domain) {
      skipped++
      continue
    }
    const extracted = parseDomainFromServiceName(row.serviceName)
    if (!extracted) {
      skipped++
      continue
    }

    console.log(
      `${dryRun ? '[dry-run] would update' : 'update'} ${row.id} ← ${extracted} (from "${row.serviceName}")`
    )

    if (!dryRun) {
      await prisma.clientRenewal.update({
        where: { id: row.id },
        data: { domain: extracted },
      })
    }
    updated++
  }

  console.log('---')
  console.log('Candidates scanned:', rows.length)
  console.log(dryRun ? 'Would update:' : 'Updated:', updated)
  console.log('Skipped:', skipped)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
