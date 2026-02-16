/**
 * Importa clienti da un file CSV (una riga, nomi separati da virgola).
 * Usa lo stesso database dell'app (lib/prisma).
 * Uso: npx tsx scripts/import-clients.ts [path/to/file.csv]
 */

import { readFileSync } from 'fs'
import { prisma } from '../lib/prisma'

function parseCsvLine(line: string): string[] {
  const names: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
      names.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  if (current.length) names.push(current.trim())
  return names
}

async function main() {
  const path = process.argv[2]
  if (!path) {
    console.error('Uso: npx tsx scripts/import-clients.ts <path/to/data.csv>')
    process.exit(1)
  }

  const content = readFileSync(path, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  const allNames: string[] = []
  for (const line of lines) {
    allNames.push(...parseCsvLine(line))
  }
  const names = [...new Set(allNames.map((n) => n.trim()).filter(Boolean))]

  if (names.length === 0) {
    console.log('Nessun nome trovato nel CSV.')
    return
  }

  const existing = await prisma.client.findMany({
    where: { name: { in: names } },
    select: { name: true },
  })
  const existingSet = new Set(existing.map((c) => c.name))
  const toCreate = names.filter((n) => !existingSet.has(n))

  if (toCreate.length === 0) {
    console.log(`Tutti i ${names.length} clienti sono già presenti nel database.`)
    return
  }

  for (const name of toCreate) {
    await prisma.client.create({
      data: { name },
    })
  }

  console.log(`✅ Importati ${toCreate.length} clienti (${existingSet.size} già presenti).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
