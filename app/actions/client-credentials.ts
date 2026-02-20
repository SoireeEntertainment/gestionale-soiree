'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  encryptCredentialValue,
  decryptCredentialValue,
} from '@/lib/credentials-crypto'

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

export async function getClientCredentials(
  clientId: string
): Promise<ClientCredentialRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const rows = await prisma.clientCredential.findMany({
    where: { clientId },
    orderBy: { label: 'asc' },
  })

  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    label: r.label,
    username: decryptCredentialValue(r.username),
    password: decryptCredentialValue(r.password),
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

const credentialSchema = z.object({
  label: z.string().min(1, 'Etichetta obbligatoria'),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function upsertClientCredential(
  clientId: string,
  data: {
    id?: string
    label: string
    username?: string | null
    password?: string | null
    notes?: string | null
  }
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

  const usernameEnc = encryptCredentialValue(validated.username)
  const passwordEnc = encryptCredentialValue(validated.password)

  if (data.id) {
    const existing = await prisma.clientCredential.findFirst({
      where: { id: data.id, clientId },
    })
    if (!existing) throw new Error('Credenziale non trovata')
    await prisma.clientCredential.update({
      where: { id: data.id },
      data: {
        label: validated.label,
        username: usernameEnc,
        password: passwordEnc,
        notes: validated.notes,
      },
    })
  } else {
    await prisma.clientCredential.create({
      data: {
        clientId,
        label: validated.label,
        username: usernameEnc,
        password: passwordEnc,
        notes: validated.notes,
      },
    })
  }

  revalidatePath(`/clients/${clientId}`)
}

export async function deleteClientCredential(
  credentialId: string,
  clientId: string
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const existing = await prisma.clientCredential.findFirst({
    where: { id: credentialId, clientId },
  })
  if (!existing) throw new Error('Credenziale non trovata')

  await prisma.clientCredential.delete({
    where: { id: credentialId },
  })

  revalidatePath(`/clients/${clientId}`)
}
