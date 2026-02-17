import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Postgres obbligatorio: in locale usa .env con DATABASE_URL; su Vercel aggiungi un DB Postgres e imposta DATABASE_URL
const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL mancante. In locale: crea .env con DATABASE_URL="postgresql://...". Su Vercel: Storage → Create Database → Postgres, poi imposta DATABASE_URL. Vedi SETUP_VERCEL_DATABASE.md'
  )
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
