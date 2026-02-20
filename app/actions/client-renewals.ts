'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { clientRenewalSchema } from '@/lib/validations'

export type ClientRenewalRow = {
  id: string
  clientId: string
  serviceName: string
  renewalDate: Date
  billingDate: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

function toDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z')
  if (Number.isNaN(d.getTime())) throw new Error('Data non valida')
  return d
}

export async function getClientRenewals(
  clientId: string
): Promise<ClientRenewalRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const rows = await prisma.clientRenewal.findMany({
    where: { clientId },
    orderBy: { renewalDate: 'asc' },
  })
  return rows
}

export async function createClientRenewal(
  clientId: string,
  data: { serviceName: string; renewalDate: string; billingDate?: string | null; notes?: string | null }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = clientRenewalSchema.parse({
    serviceName: data.serviceName,
    renewalDate: data.renewalDate,
    billingDate: data.billingDate ?? '',
    notes: data.notes ?? null,
  })

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) throw new Error('Cliente non trovato')

  await prisma.clientRenewal.create({
    data: {
      clientId,
      serviceName: validated.serviceName,
      renewalDate: toDate(validated.renewalDate),
      billingDate:
        validated.billingDate && validated.billingDate.trim() !== ''
          ? toDate(validated.billingDate.trim())
          : null,
      notes: validated.notes?.trim() || null,
    },
  })

  revalidatePath(`/clients/${clientId}`)
}

export async function updateClientRenewal(
  id: string,
  clientId: string,
  data: { serviceName: string; renewalDate: string; billingDate?: string | null; notes?: string | null }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const existing = await prisma.clientRenewal.findFirst({
    where: { id, clientId },
  })
  if (!existing) throw new Error('Scadenza non trovata')

  const validated = clientRenewalSchema.parse({
    serviceName: data.serviceName,
    renewalDate: data.renewalDate,
    billingDate: data.billingDate ?? '',
    notes: data.notes ?? null,
  })

  await prisma.clientRenewal.update({
    where: { id },
    data: {
      serviceName: validated.serviceName,
      renewalDate: toDate(validated.renewalDate),
      billingDate:
        validated.billingDate && validated.billingDate.trim() !== ''
          ? toDate(validated.billingDate.trim())
          : null,
      notes: validated.notes?.trim() || null,
    },
  })

  revalidatePath(`/clients/${clientId}`)
}

export async function deleteClientRenewal(id: string, clientId: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const existing = await prisma.clientRenewal.findFirst({
    where: { id, clientId },
  })
  if (!existing) throw new Error('Scadenza non trovata')

  await prisma.clientRenewal.delete({ where: { id } })
  revalidatePath(`/clients/${clientId}`)
}
