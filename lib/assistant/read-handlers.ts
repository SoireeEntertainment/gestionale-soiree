import { prisma } from '@/lib/prisma'
import { getISOWeekStart, toDateString } from '@/lib/ped-utils'
import { resolveUserByNameHint } from '@/lib/assistant/resolve-entities'

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
