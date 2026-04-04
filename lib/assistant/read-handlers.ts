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

/** Credenziali cliente: senza `revealSecrets` le password non sono mostrate in chiaro. */
export async function readClientCredentialsForQuery(
  clientNameHint: string,
  labelHint: string,
  options?: { revealSecrets?: boolean }
): Promise<string> {
  const reveal = options?.revealSecrets === true
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
    const hasP = Boolean(decryptCredentialValue(r.password))
    const p = reveal
      ? decryptCredentialValue(r.password) ?? '—'
      : hasP
        ? '**(nascosta — chiedi esplicitamente la password in chiaro)**'
        : '—'
    const n = r.notes?.trim() ? ` · note: ${r.notes}` : ''
    return `- **${r.label}** · utente: ${u} · password: ${p}${n}`
  })
  const hint = reveal
    ? ''
    : '\n\n_Password mascherate per sicurezza. Per vedere i valori completi chiedi esplicitamente «mostra password in chiaro»._'
  return `Credenziali per **${cr.name}** (filtro "${labelHint}"):\n${lines.join('\n')}${hint}`
}

function monthRangeUtc(): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const start = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, mo + 1, 0, 23, 59, 59, 999))
  return { start, end }
}

/** Task PED non completate nel mese corrente (UTC) per cliente. */
export async function readPedTasksRemainingThisMonthForClient(clientNameHint: string): Promise<string> {
  const cr = await resolveSingleClient(clientNameHint)
  if (!cr) {
    return `Non ho trovato un cliente simile a "${clientNameHint}".`
  }
  if ('ambiguous' in cr) {
    return `Più clienti compatibili: ${cr.ambiguous.map((c) => c.name).join(', ')}.`
  }
  const { start, end } = monthRangeUtc()
  const items = await prisma.pedItem.findMany({
    where: {
      clientId: cr.id,
      date: { gte: start, lte: end },
      status: { not: 'DONE' },
    },
    select: { date: true, title: true, label: true, status: true },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
    take: 80,
  })
  if (items.length === 0) {
    return `Nessuna task PED ancora da completare per **${cr.name}** nel mese corrente (non DONE).`
  }
  const lines = items.map((i) => {
    const dk = toDateString(new Date(i.date))
    return `- ${dk} · ${i.title} (${i.label ?? i.status})`
  })
  return `Task PED ancora da completare per **${cr.name}** questo mese: **${items.length}**.\n${lines.join('\n')}`
}

/** Classifica clienti per numero di lavori attivi. */
export async function readTopClientsByActiveWorks(limit = 10): Promise<string> {
  const works = await prisma.work.findMany({
    where: { status: { in: [...ACTIVE_WORK_STATUSES] } },
    select: { clientId: true, client: { select: { name: true } } },
  })
  const map = new Map<string, { name: string; n: number }>()
  for (const w of works) {
    const cur = map.get(w.clientId) ?? { name: w.client.name, n: 0 }
    cur.n += 1
    map.set(w.clientId, cur)
  }
  const sorted = [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, limit)
  if (sorted.length === 0) {
    return 'Nessun lavoro attivo nel sistema.'
  }
  const lines = sorted.map(([_, v], i) => `${i + 1}. **${v.name}** — ${v.n} lavori attivi`)
  return `Clienti con più lavori attivi:\n${lines.join('\n')}`
}

function todayRangeUtc(): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const mo = now.getUTCMonth()
  const d = now.getUTCDate()
  const start = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999))
  return { start, end }
}

/** Task PED di oggi per l’utente corrente (assegnate a lui o di cui è owner senza assegnatario). */
export async function readMyPedTasksToday(userId: string, userNameForLabel: string): Promise<string> {
  const { start, end } = todayRangeUtc()
  const items = await prisma.pedItem.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [{ assignedToUserId: userId }, { ownerId: userId, assignedToUserId: null }],
    },
    select: {
      title: true,
      status: true,
      label: true,
      client: { select: { name: true } },
    },
    orderBy: [{ title: 'asc' }],
    take: 60,
  })
  if (items.length === 0) {
    return `Nessuna task PED in agenda oggi per **${userNameForLabel}**.`
  }
  const lines = items.map((i) => `- ${i.client.name} · ${i.title} (${i.label ?? i.status})`)
  return `Le tue task PED oggi (**${userNameForLabel}**):\n${lines.join('\n')}`
}

/** Clienti che hanno almeno un lavoro attivo nella categoria indicata (nome parziale). */
export async function readClientsWithActiveCategoryWork(categoryHint: string): Promise<string> {
  const q = categoryHint.trim()
  if (!q) return 'Indica la categoria (es. Website).'
  const cats = await prisma.category.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    take: 3,
  })
  if (cats.length === 0) {
    return `Nessuna categoria simile a "${categoryHint}".`
  }
  const cat = cats[0]
  const works = await prisma.work.findMany({
    where: {
      categoryId: cat.id,
      status: { in: [...ACTIVE_WORK_STATUSES] },
    },
    select: { client: { select: { id: true, name: true } } },
    take: 200,
  })
  const seen = new Map<string, string>()
  for (const w of works) {
    seen.set(w.client.id, w.client.name)
  }
  const names = [...seen.values()].sort((a, b) => a.localeCompare(b, 'it'))
  if (names.length === 0) {
    return `Nessun cliente con lavori attivi in categoria **${cat.name}**.`
  }
  return `Clienti con lavoro attivo in categoria **${cat.name}** (${names.length}):\n${names.map((n) => `- ${n}`).join('\n')}`
}
