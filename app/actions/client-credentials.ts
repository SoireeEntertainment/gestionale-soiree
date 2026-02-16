'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export type ClientCredentialRow = {
  id: string
  clientId: string
  label: string
  username: string | null
  password: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export async function getClientCredentials(clientId: string): Promise<ClientCredentialRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const rows = await prisma.$queryRaw<ClientCredentialRow[]>`
    SELECT id, "clientId", label, username, password, notes, "createdAt", "updatedAt"
    FROM client_credentials
    WHERE "clientId" = ${clientId}
    ORDER BY label ASC
  `
  return rows
}

const credentialSchema = z.object({
  label: z.string().min(1, 'Etichetta obbligatoria'),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function upsertClientCredential(
  clientId: string,
  data: { id?: string; label: string; username?: string | null; password?: string | null; notes?: string | null }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = credentialSchema.parse({
    label: data.label,
    username: data.username ?? null,
    password: data.password ?? null,
    notes: data.notes ?? null,
  })

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) throw new Error('Cliente non trovato')

  if (data.id) {
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM client_credentials WHERE id = ${data.id} AND "clientId" = ${clientId}
    `
    if (!existing.length) throw new Error('Credenziale non trovata')
    await prisma.$executeRaw`
      UPDATE client_credentials
      SET label = ${validated.label}, username = ${validated.username}, password = ${validated.password}, notes = ${validated.notes}, "updatedAt" = datetime('now')
      WHERE id = ${data.id}
    `
  } else {
    const id = `cuid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    await prisma.$executeRaw`
      INSERT INTO client_credentials (id, "clientId", label, username, password, notes, "createdAt", "updatedAt")
      VALUES (${id}, ${clientId}, ${validated.label}, ${validated.username}, ${validated.password}, ${validated.notes}, datetime('now'), datetime('now'))
    `
  }

  revalidatePath(`/clients/${clientId}`)
}

export async function deleteClientCredential(credentialId: string, clientId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM client_credentials WHERE id = ${credentialId} AND "clientId" = ${clientId}
  `
  if (!existing.length) throw new Error('Credenziale non trovata')

  await prisma.$executeRaw`
    DELETE FROM client_credentials WHERE id = ${credentialId}
  `

  revalidatePath(`/clients/${clientId}`)
}
