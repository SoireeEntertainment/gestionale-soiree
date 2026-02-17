/**
 * Migra i dati da SQLite (dev.db) a Postgres.
 * Uso: DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-postgres.ts
 * Opzionale: SQLITE_DB_PATH="./prisma/dev.db" (default: prisma/dev.db)
 */

import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const SQLITE_PATH =
  process.env.SQLITE_DB_PATH ||
  path.join(process.cwd(), 'prisma', 'dev.db')
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL || !DATABASE_URL.startsWith('postgres')) {
  console.error('Imposta DATABASE_URL con la URL Postgres di destinazione.')
  process.exit(1)
}

if (!fs.existsSync(SQLITE_PATH)) {
  console.error('File SQLite non trovato:', SQLITE_PATH)
  process.exit(1)
}

// Normalizza una riga letta da SQLite per Prisma (boolean e date)
function normalizeRow(row: Record<string, unknown>, boolKeys: string[], dateKeys: string[]): Record<string, unknown> {
  const out = { ...row }
  for (const k of boolKeys) {
    if (k in out && (out[k] === 0 || out[k] === 1)) out[k] = out[k] === 1
  }
  for (const k of dateKeys) {
    if (k in out && out[k] != null) {
      const v = out[k]
      if (typeof v === 'string') out[k] = new Date(v)
      else if (typeof v === 'number') out[k] = new Date(v)
    }
  }
  return out
}

async function main() {
  const db = new Database(SQLITE_PATH, { readonly: true })
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  })

  const tables: {
    name: string
    boolKeys: string[]
    dateKeys: string[]
  }[] = [
    { name: 'users', boolKeys: ['isActive'], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'categories', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'clients', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'client_credentials', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'client_categories', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'works', boolKeys: [], dateKeys: ['deadline', 'createdAt', 'updatedAt'] },
    { name: 'work_steps', boolKeys: [], dateKeys: ['completedAt', 'createdAt', 'updatedAt'] },
    { name: 'work_comments', boolKeys: [], dateKeys: ['createdAt'] },
    { name: 'user_todos', boolKeys: ['completed'], dateKeys: ['createdAt'] },
    { name: 'user_preferences', boolKeys: ['notifyDeadline24h', 'notifyDeadline48h', 'notifyInReview', 'notifyWaitingClient'], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'preventivi', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'preventivo_items', boolKeys: [], dateKeys: [] },
    { name: 'ped_client_settings', boolKeys: [], dateKeys: ['createdAt', 'updatedAt'] },
    { name: 'ped_items', boolKeys: ['isExtra'], dateKeys: ['date', 'createdAt', 'updatedAt'] },
  ]

  for (const { name, boolKeys, dateKeys } of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[]
      if (rows.length === 0) {
        console.log(`  [${name}] nessuna riga, skip`)
        continue
      }
      const data = rows.map((r) => normalizeRow(r, boolKeys, dateKeys))
      // Prisma model names: table name to camelCase / singular form
      const modelMap: Record<string, keyof PrismaClient> = {
        users: 'user',
        categories: 'category',
        clients: 'client',
        client_credentials: 'clientCredential',
        client_categories: 'clientCategory',
        works: 'work',
        work_steps: 'workStep',
        work_comments: 'workComment',
        user_todos: 'userTodo',
        user_preferences: 'userPreference',
        preventivi: 'preventivo',
        preventivo_items: 'preventivoItem',
        ped_client_settings: 'pedClientSetting',
        ped_items: 'pedItem',
      }
      const model = modelMap[name]
      if (!model) {
        console.warn(`  [${name}] modello non mappato, skip`)
        continue
      }
      const delegate = (prisma as any)[model]
      if (!delegate?.createMany) {
        console.warn(`  [${name}] createMany non disponibile, skip`)
        continue
      }
      await delegate.createMany({ data, skipDuplicates: true })
      console.log(`  [${name}] migrate ${data.length} righe`)
    } catch (e) {
      console.error(`  [${name}] errore:`, e)
      throw e
    }
  }

  db.close()
  await prisma.$disconnect()
  console.log('Migrazione completata.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
