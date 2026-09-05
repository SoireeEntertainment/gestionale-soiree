'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { clientRenewalSchema, RENEWAL_STATUSES } from '@/lib/validations'
import { normalizeDomainInput } from '@/lib/domain-renewal-utils'

export type ClientRenewalRow = {
  id: string
  clientId: string
  serviceName: string
  domain: string | null
  renewalDate: Date
  billingDate: Date | null
  status?: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

function toDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z')
  if (Number.isNaN(d.getTime())) throw new Error('Data non valida')
  return d
}

function resolveDomain(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const normalized = normalizeDomainInput(trimmed)
  if (!normalized) {
    throw new Error('Inserisci un dominio valido, es. esempio.it')
  }
  return normalized
}

export async function getClientRenewals(
  clientId: string
): Promise<ClientRenewalRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  try {
    const rows = await prisma.clientRenewal.findMany({
      where: { clientId },
      orderBy: { renewalDate: 'asc' },
    })
    return rows.map((r) => ({
      ...r,
      domain: (r as { domain?: string | null }).domain ?? null,
      status: (r as { status?: string }).status ?? 'DA_FARE',
    }))
  } catch (err) {
    console.warn('[getClientRenewals] Query failed (migration may be missing):', err instanceof Error ? err.message : err)
    return []
  }
}

export async function createClientRenewal(
  clientId: string,
  data: {
    serviceName: string
    domain?: string | null
    renewalDate: string
    billingDate?: string | null
    status?: string
    notes?: string | null
  }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const validated = clientRenewalSchema.parse({
    serviceName: data.serviceName,
    domain: data.domain ?? null,
    renewalDate: data.renewalDate,
    billingDate: data.billingDate ?? '',
    status: data.status ?? 'DA_FARE',
    notes: data.notes ?? null,
  })
  const status = (RENEWAL_STATUSES as readonly string[]).includes(validated.status ?? '')
    ? validated.status!
    : 'DA_FARE'
  const domain = resolveDomain(validated.domain ?? null)

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) throw new Error('Cliente non trovato')

  const row = await prisma.clientRenewal.create({
    data: {
      clientId,
      serviceName: validated.serviceName,
      domain,
      renewalDate: toDate(validated.renewalDate),
      billingDate:
        validated.billingDate && validated.billingDate.trim() !== ''
          ? toDate(validated.billingDate.trim())
          : null,
      status,
      notes: validated.notes?.trim() || null,
    },
  })

  revalidatePath(`/clients/${clientId}`)
  return { id: row.id }
}

export async function updateClientRenewal(
  id: string,
  clientId: string,
  data: {
    serviceName: string
    domain?: string | null
    renewalDate: string
    billingDate?: string | null
    status?: string
    notes?: string | null
  }
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const existing = await prisma.clientRenewal.findFirst({
    where: { id, clientId },
  })
  if (!existing) throw new Error('Scadenza non trovata')

  const validated = clientRenewalSchema.parse({
    serviceName: data.serviceName,
    domain: data.domain ?? null,
    renewalDate: data.renewalDate,
    billingDate: data.billingDate ?? '',
    status: (data as { status?: string }).status ?? undefined,
    notes: data.notes ?? null,
  })
  const domain = resolveDomain(validated.domain ?? null)
  const updateData: Record<string, unknown> = {
    serviceName: validated.serviceName,
    domain,
    renewalDate: toDate(validated.renewalDate),
    billingDate:
      validated.billingDate && validated.billingDate.trim() !== ''
        ? toDate(validated.billingDate.trim())
        : null,
    notes: validated.notes?.trim() || null,
  }
  if (validated.status && (RENEWAL_STATUSES as readonly string[]).includes(validated.status)) {
    updateData.status = validated.status
  }

  await prisma.clientRenewal.update({
    where: { id },
    data: updateData as any,
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
