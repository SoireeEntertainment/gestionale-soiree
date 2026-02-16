import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Usa DATABASE_URL se impostato (es. da .env), altrimenti percorso assoluto
const databaseUrl =
  process.env.DATABASE_URL ||
  'file:/Volumes/Extreme Pro/Soirëe_Personal/Gestionale Soiree/dev.db'

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
