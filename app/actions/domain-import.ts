'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import {
  parseDomainsInput,
  matchDomainToClient,
  getDomainMatchCandidates,
  type DomainImportRow,
  type ClientForMatch,
} from '@/lib/domain-import-utils'

const DOMAIN_SERVICE_PREFIX = 'Dominio: '
const IMPORT_NOTES = 'Import Hostinger'

export type { DomainImportRow }

export type MatchedRow = DomainImportRow & { clientId: string; clientName: string }
export type AmbiguousRow = DomainImportRow & { possibleClients: { id: string; name: string }[] }
export type UnmatchedRow = DomainImportRow

export type DomainMatchResult = {
  matched: MatchedRow[]
  ambiguous: AmbiguousRow[]
  unmatched: UnmatchedRow[]
}

/** Restituisce tutti i clienti (id, name) per il matching. */
export async function getClientsForDomainMatch(): Promise<ClientForMatch[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const list = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  return list
}

/**
 * Analizza il testo incollato: parsing + matching. Per pulsante "Analizza".
 */
export async function analyzeDomainsInput(text: string): Promise<{
  parsed: DomainImportRow[]
  matchResult: DomainMatchResult
}> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  const parsed = parseDomainsInput(text)
  const matchResult = await findClientMatches(parsed)
  return { parsed, matchResult }
}

/**
 * Analizza le righe importate e classifica in matched / ambiguous / unmatched.
 */
export async function findClientMatches(rows: DomainImportRow[]): Promise<DomainMatchResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const clients = await getClientsForDomainMatch()
  const matched: MatchedRow[] = []
  const ambiguous: AmbiguousRow[] = []
  const unmatched: UnmatchedRow[] = []

  for (const row of rows) {
    const expiryOk = /^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate)
    if (!expiryOk) continue

    const result = matchDomainToClient(row.domain, clients)
    if (result === null) {
      unmatched.push(row)
    } else if (result === 'ambiguous') {
      const possibleClients = getDomainMatchCandidates(row.domain, clients)
      ambiguous.push({ ...row, possibleClients })
    } else {
      matched.push({ ...row, clientId: result.clientId, clientName: result.clientName })
    }
  }

  return { matched, ambiguous, unmatched }
}

function toDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z')
  if (Number.isNaN(d.getTime())) throw new Error('Data non valida')
  return d
}

/** Assicura che il cliente abbia la categoria Website (solo add, persistente). */
async function ensureClientWebsite(clientId: string): Promise<void> {
  const websiteCategory = await prisma.category.findFirst({ where: { name: 'Website' } })
  if (!websiteCategory) return
  await prisma.clientCategory.upsert({
    where: { clientId_categoryId: { clientId, categoryId: websiteCategory.id } },
    create: { clientId, categoryId: websiteCategory.id, status: 'ACTIVE' },
    update: {},
  })
}

/**
 * Applica l'import: per ogni riga matched upsert scadenza (Dominio: domain, renewalDate, billingDate null)
 * e assicura categoria Website per il cliente.
 */
export async function applyDomainRenewals(matched: MatchedRow[]): Promise<{
  renewed: number
  clientsWithWebsite: number
}> {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const clientIdsTouched = new Set<string>()
  let renewed = 0

  for (const row of matched) {
    const serviceName = DOMAIN_SERVICE_PREFIX + row.domain
    const renewalDate = toDate(row.expiryDate)

    const existing = await prisma.clientRenewal.findFirst({
      where: { clientId: row.clientId, serviceName },
    })

    if (existing) {
      await prisma.clientRenewal.update({
        where: { id: existing.id },
        data: { renewalDate, notes: IMPORT_NOTES },
      })
    } else {
      await prisma.clientRenewal.create({
        data: {
          clientId: row.clientId,
          serviceName,
          renewalDate,
          billingDate: null,
          notes: IMPORT_NOTES,
        },
      })
    }
    renewed++
    clientIdsTouched.add(row.clientId)
  }

  for (const clientId of clientIdsTouched) {
    await ensureClientWebsite(clientId)
    revalidatePath(`/clients/${clientId}`)
  }

  revalidatePath('/clients')
  return { renewed, clientsWithWebsite: clientIdsTouched.size }
}
