import { prisma } from '@/lib/prisma'
import { getISOWeekStart, toDateString } from '@/lib/ped-utils'
import { resolveUserByNameHint, resolveSingleClient } from '@/lib/assistant/resolve-entities'
import { decryptCredentialValue } from '@/lib/credentials-crypto'

function weekRangeUtc(): { start: Date; end: Date } {
  const now = new Date()
  const monday = getISOWeekStart(now)
  const start = new Date(monday)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(monday)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

/** Task PED assegnate a un utente nella settimana corrente (lun–dom UTC ISO). */
export async function readPedTasksThisWeekForUser(userNameHint: string): Promise<string> {
  const resolved = await resolveUserByNameHint(userNameHint)
  if (!resolved) {
    return `Non ho trovato un utente con nome simile a "${userNameHint}".`
  }
  if ('ambiguous' in resolved) {
    const names = resolved.ambiguous.map((u) => u.name).join(', ')
    return `Ho trovato più utenti compatibili: ${names}. Specifica il nome completo.`
  }
  const { start, end } = weekRangeUtc()
  const items = await prisma.pedItem.findMany({
    where: {
      assignedToUserId: resolved.id,
      date: { gte: start, lte: end },
    },
    select: {
      date: true,
      title: true,
      client: { select: { name: true } },
      status: true,
      label: true,
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
    take: 80,
  })
  if (items.length === 0) {
    return `Nessuna task PED assegnata a **${resolved.name}** in questa settimana (lun–dom).`
  }
  const lines = items.map((i) => {
    const dk = toDateString(new Date(i.date))
    return `- ${dk} · ${i.client.name} · ${i.title} (${i.label ?? i.status})`
  })
  return `Task PED di **${resolved.name}** questa settimana:\n${lines.join('\n')}`
}

/** Rinnovi in scadenza nei prossimi N giorni. */
export async function readRenewalsDueWithinDays(days: number): Promise<string> {
  const d = Math.min(Math.max(1, Math.floor(days)), 365)
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const until = new Date(now)
  until.setUTCDate(until.getUTCDate() + d)
  until.setUTCHours(23, 59, 59, 999)

  const rows = await prisma.clientRenewal.findMany({
    where: {
      renewalDate: { gte: now, lte: until },
      status: { not: 'ANNULLATO' },
    },
    select: {
      renewalDate: true,
      serviceName: true,
      status: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: { renewalDate: 'asc' },
    take: 100,
  })
  if (rows.length === 0) {
    return `Nessun rinnovo in scadenza nei prossimi ${d} giorni.`
  }
  const lines = rows.map(
    (r) =>
      `- ${r.client.name} · ${r.serviceName} · ${r.renewalDate.toISOString().slice(0, 10)} (${r.status})`
  )
  return `Rinnovi in scadenza entro ${d} giorni:\n${lines.join('\n')}`
}

const ACTIVE_WORK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED'] as const

/** Lavori non conclusi assegnati a un utente (per nome). */
export async function readActiveWorksForUser(userNameHint: string): Promise<string> {
  const resolved = await resolveUserByNameHint(userNameHint)
  if (!resolved) {
    return `Non ho trovato un utente con nome simile a "${userNameHint}".`
  }
  if ('ambiguous' in resolved) {
    const names = resolved.ambiguous.map((u) => u.name).join(', ')
    return `Ho trovato più utenti compatibili: ${names}. Specifica meglio il nome.`
  }
  const works = await prisma.work.findMany({
    where: {
      assignedToUserId: resolved.id,
      status: { in: [...ACTIVE_WORK_STATUSES] },
    },
    select: {
      title: true,
      status: true,
      deadline: true,
      client: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
    take: 60,
  })
  if (works.length === 0) {
    return `Nessun lavoro attivo assegnato a **${resolved.name}**.`
  }
  const lines = works.map((w) => {
    const dl = w.deadline ? w.deadline.toISOString().slice(0, 10) : '—'
    return `- ${w.client.name} · ${w.title} (${w.category.name}) · ${w.status} · scadenza ${dl}`
  })
  return `Lavori attivi per **${resolved.name}**:\n${lines.join('\n')}`
}

/** Credenziali cliente filtrate per etichetta (lettura interna, valori decifrati). */
export async function readClientCredentialsForQuery(clientNameHint: string, labelHint: string): Promise<string> {
  const cr = await resolveSingleClient(clientNameHint)
  if (!cr) {
    return `Non ho trovato un cliente simile a "${clientNameHint}".`
  }
  if ('ambiguous' in cr) {
    const names = cr.ambiguous.map((c) => c.name).join(', ')
    return `Ho trovato più clienti: ${names}. Quale intendi?`
  }
  const rows = await prisma.clientCredential.findMany({
    where: {
      clientId: cr.id,
      label: { contains: labelHint.trim(), mode: 'insensitive' },
    },
    select: { label: true, username: true, password: true, notes: true },
    orderBy: { label: 'asc' },
    take: 20,
  })
  if (rows.length === 0) {
    return `Nessuna credenziale "${labelHint}" trovata per **${cr.name}**.`
  }
  const lines = rows.map((r) => {
    const u = decryptCredentialValue(r.username) ?? '—'
    const p = decryptCredentialValue(r.password) ?? '—'
    const n = r.notes?.trim() ? ` · note: ${r.notes}` : ''
    return `- **${r.label}** · utente: ${u} · password: ${p}${n}`
  })
  return `Credenziali per **${cr.name}** (filtro "${labelHint}"):\n${lines.join('\n')}`
}
