'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { toDateString, getISOWeekStart } from '@/lib/ped-utils'
import { getEffectiveLabel, PED_LABEL_ORDER, DEFAULT_LABEL, DONE_LABEL, PED_LABELS, type PedLabel } from '@/lib/pedLabels'
import { pedClientSettingSchema, pedItemCreateSchema, pedItemUpdateSchema, pedItemSetLabelSchema } from '@/lib/validations'

async function getOwnerId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.id ?? null
}

/** Per "Guarda PED di...": se fornito, usa questo userId come owner (solo lettura dati). Richiede utente loggato. */
async function getViewOwnerId(viewAsUserId: string | undefined): Promise<string | null> {
  const current = await getCurrentUser()
  if (!current) return null
  if (viewAsUserId) return viewAsUserId
  return current.id
}

async function ensureSortOrderColumn(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE ped_items ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0'
    )
  } catch {
    // Colonna già presente
  }
}

export async function getPedMonth(year: number, month: number, viewAsUserId?: string) {
  const ownerId = await getViewOwnerId(viewAsUserId)
  if (!ownerId) throw new Error('Non autorizzato')

  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const lastDay = new Date(Date.UTC(year, month, 0))
  const daysToSunday = (7 - lastDay.getUTCDay()) % 7
  const startMs = Date.UTC(year, month - 1, 1 - firstWeekday, 0, 0, 0, 0)
  const endMs = lastDay.getTime() + daysToSunday * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)

  const settings = await prisma.pedClientSetting.findMany({
    where: { ownerId },
    include: { client: { select: { id: true, name: true } } },
  })

  const itemWhere = { OR: [{ ownerId }, { assignedToUserId: ownerId }] }
  const allItemsRaw = await prisma.pedItem.findMany({
    where: itemWhere,
    include: {
      client: { select: { id: true, name: true } },
      work: { select: { id: true, title: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  })
  const allItems = allItemsRaw

  const orderRows = await prisma.pedItem.findMany({
    where: itemWhere,
    select: { id: true, sortOrder: true },
  })
  const sortOrderById = new Map(orderRows.map((r) => [r.id, Number(r.sortOrder) ?? 0]))

  const filtered = allItems.filter((item) => {
    const d = new Date(item.date).getTime()
    return d >= startDate.getTime() && d <= endDate.getTime()
  })

  // Ordine: date → ordine etichetta (PED_LABEL_ORDER) → sortOrder → createdAt
  const labelOrder = (item: (typeof filtered)[0]) => PED_LABEL_ORDER[getEffectiveLabel(item)] ?? 1
  const items = filtered.sort((a, b) => {
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (da !== db) return da - db
    const orderA = labelOrder(a)
    const orderB = labelOrder(b)
    if (orderA !== orderB) return orderA - orderB
    const soA = a.sortOrder ?? 0
    const soB = b.sortOrder ?? 0
    if (soA !== soB) return soA - soB
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount: number }> = {}
  const weekMap = new Map<string, { total: number; done: number }>()
  let monthlyTotal = 0
  let monthlyDone = 0

  for (const item of items) {
    const dayKey = toDateString(new Date(item.date))
    if (!dailyStats[dayKey]) dailyStats[dayKey] = { total: 0, done: 0, remainingPct: 0, remainingCount: 0 }
    dailyStats[dayKey].total++
    if (item.status === 'DONE') dailyStats[dayKey].done++
    monthlyTotal++
    if (item.status === 'DONE') monthlyDone++

    const weekStart = getISOWeekStart(new Date(item.date))
    const weekKey = toDateString(weekStart)
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, { total: 0, done: 0 })
    const w = weekMap.get(weekKey)!
    w.total++
    if (item.status === 'DONE') w.done++
  }

  for (const key of Object.keys(dailyStats)) {
    const s = dailyStats[key]
    s.remainingCount = s.total - s.done
    s.remainingPct = s.total === 0 ? 0 : Math.round((s.remainingCount / s.total) * 100)
  }

  const weeklyStats = Array.from(weekMap.entries()).map(([weekStart, { total, done }]) => {
    const d = new Date(weekStart + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() + 6)
    return {
      weekStart,
      weekEnd: toDateString(d),
      total,
      done,
    }
  })

  const settingsSorted = [...settings].sort((a, b) =>
    a.client.name.localeCompare(b.client.name, 'it')
  )

  return {
    pedClientSettings: settingsSorted,
    pedItems: items,
    computedStats: {
      dailyStats,
      weeklyStats,
      monthlyStats: { total: monthlyTotal, done: monthlyDone },
    },
  }
}

/** Statistiche PED per un giorno per un utente (owner o assignedTo). Autorizzato solo se currentUser.id === userId. */
export async function getPedDailyStatsForUser(userId: string, dateKey: string): Promise<{
  total: number
  remaining: number
  done: number
  byLabel: Record<PedLabel, number>
}> {
  const current = await getCurrentUser()
  if (!current || current.id !== userId) throw new Error('Non autorizzato')

  const dayStart = new Date(dateKey + 'T00:00:00.000Z')
  const dayEnd = new Date(dateKey + 'T23:59:59.999Z')
  const itemWhere = {
    OR: [{ ownerId: userId }, { assignedToUserId: userId }],
    date: { gte: dayStart, lte: dayEnd },
  }
  const items = await prisma.pedItem.findMany({
    where: itemWhere,
    select: { status: true, label: true, priority: true },
  })

  const byLabel: Record<PedLabel, number> = {
    IN_APPROVAZIONE: 0,
    DA_FARE: 0,
    PRONTO_NON_PUBBLICATO: 0,
    FATTO: 0,
  }
  let done = 0
  for (const item of items) {
    const label = getEffectiveLabel(item)
    byLabel[label] = (byLabel[label] ?? 0) + 1
    if (item.status === 'DONE') done++
  }
  const total = items.length
  const remaining = total - done
  return { total, remaining, done, byLabel }
}

function isOverviewAdmin(current: { name: string | null }): boolean {
  return current.name === 'Cristian Palazzolo' || current.name === 'Davide Piccolo'
}

/** Conteggio task PED nel giorno (dateKey YYYY-MM-DD). Autorizzato se currentUser.id === userId o overview-admin. */
export async function getPedDailyTaskCountForUser(userId: string, dateKey: string): Promise<number> {
  const current = await getCurrentUser()
  if (!current) throw new Error('Non autorizzato')
  const isSelf = current.id === userId
  if (!isSelf && !isOverviewAdmin(current)) throw new Error('Non autorizzato')
  const dayStart = new Date(dateKey + 'T00:00:00.000Z')
  const dayEnd = new Date(dateKey + 'T23:59:59.999Z')
  return prisma.pedItem.count({
    where: {
      OR: [{ ownerId: userId }, { assignedToUserId: userId }],
      date: { gte: dayStart, lte: dayEnd },
    },
  })
}

/** Conteggio task PED nella settimana ISO corrente per un utente. Autorizzato se currentUser.id === userId o utente è overview-admin. */
export async function getPedWeeklyTaskCountForUser(userId: string): Promise<number> {
  const current = await getCurrentUser()
  if (!current) throw new Error('Non autorizzato')
  const isSelf = current.id === userId
  if (!isSelf && !isOverviewAdmin(current)) throw new Error('Non autorizzato')

  const now = new Date()
  const weekStart = getISOWeekStart(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)
  const count = await prisma.pedItem.count({
    where: {
      OR: [{ ownerId: userId }, { assignedToUserId: userId }],
      date: { gte: weekStart, lte: weekEnd },
    },
  })
  return count
}

/** Conteggio task PED nel mese corrente (UTC) per un utente. Autorizzato se currentUser.id === userId o overview-admin. */
export async function getPedMonthlyTaskCountForUser(userId: string): Promise<number> {
  const current = await getCurrentUser()
  if (!current) throw new Error('Non autorizzato')
  const isSelf = current.id === userId
  if (!isSelf && !isOverviewAdmin(current)) throw new Error('Non autorizzato')

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  return prisma.pedItem.count({
    where: {
      OR: [{ ownerId: userId }, { assignedToUserId: userId }],
      date: { gte: monthStart, lte: monthEnd },
    },
  })
}

/** Restituisce le date (YYYY-MM-DD) in cui inserire task in base ai contenuti/mese (4, 6, 8, 12). */
function getTargetDateKeysForContents(year: number, month: number, count: number): string[] {
  const result: string[] = []
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const format = (d: number) => {
    const date = new Date(Date.UTC(year, month - 1, d))
    return toDateString(date)
  }

  const getDay = (d: number) => new Date(Date.UTC(year, month - 1, d)).getUTCDay() // 0=Sun, 1=Mon, ..., 3=Wed

  if (count === 4) {
    for (let d = 1; d <= lastDay && result.length < 4; d++) {
      if (getDay(d) === 3) result.push(format(d))
    }
  } else if (count === 6) {
    const wednesdayKeys: string[] = []
    for (let d = 1; d <= lastDay; d++) {
      if (getDay(d) === 3) wednesdayKeys.push(format(d))
    }
    if (wednesdayKeys[0]) result.push(wednesdayKeys[0])
    if (wednesdayKeys[2]) result.push(wednesdayKeys[2])
    for (let d = 8; d <= 14; d++) {
      if (d > lastDay) break
      if (getDay(d) === 2) { result.push(format(d)); break }
    }
    for (let d = 8; d <= 14; d++) {
      if (d > lastDay) break
      if (getDay(d) === 4) { result.push(format(d)); break }
    }
    for (let d = 22; d <= 28; d++) {
      if (d > lastDay) break
      if (getDay(d) === 2) { result.push(format(d)); break }
    }
    for (let d = 22; d <= 28; d++) {
      if (d > lastDay) break
      if (getDay(d) === 4) { result.push(format(d)); break }
    }
    result.sort()
  } else if (count === 8) {
    for (let d = 1; d <= lastDay; d++) {
      const day = getDay(d)
      if (day === 2 || day === 4) result.push(format(d))
    }
  } else if (count === 12) {
    for (let d = 1; d <= lastDay; d++) {
      const day = getDay(d)
      if (day === 1 || day === 3 || day === 5) result.push(format(d))
    }
  }
  return result
}

export async function fillPedMonth(year: number, month: number) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const settings = await prisma.pedClientSetting.findMany({
    where: { ownerId },
    include: { client: { select: { id: true, name: true } } },
  })
  const settingsSorted = settings
    .filter((s) => [4, 6, 8, 12].includes(s.contentsPerWeek))
    .sort((a, b) => a.client.name.localeCompare(b.client.name, 'it'))

  const startStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`
  const existingItems = await prisma.pedItem.findMany({
    where: {
      ownerId,
      date: { gte: new Date(startStr), lte: new Date(endStr) },
      isExtra: false,
    },
    select: { clientId: true, date: true },
  })
  const existingRows = existingItems.map((i) => ({
    clientId: i.clientId,
    dateKey: i.date.toISOString().slice(0, 10),
  }))
  const existingByClientAndDate = new Set(existingRows.map((r) => `${r.clientId}:${r.dateKey}`))

  for (const setting of settingsSorted) {
    const dateKeys = getTargetDateKeysForContents(year, month, setting.contentsPerWeek)
    for (const dateKey of dateKeys) {
      if (existingByClientAndDate.has(`${setting.clientId}:${dateKey}`)) continue
      await createPedItem({
        clientId: setting.clientId,
        date: dateKey,
        kind: 'CONTENT',
        type: 'POST',
        title: setting.client.name,
        description: null,
        priority: 'MEDIUM',
        isExtra: false,
      })
      existingByClientAndDate.add(`${setting.clientId}:${dateKey}`)
    }
  }
  revalidatePath('/ped')
}

/** Restituisce il setting PED per un singolo cliente (contenuti/mese). Usato nella scheda cliente. */
export async function getPedClientSettingByClient(clientId: string) {
  const ownerId = await getOwnerId()
  if (!ownerId) return null
  const setting = await prisma.pedClientSetting.findUnique({
    where: { ownerId_clientId: { ownerId, clientId } },
    select: { contentsPerWeek: true },
  })
  return setting ? { contentsPerWeek: setting.contentsPerWeek } : null
}

/** PED per la scheda cliente: tutti i PedItem e tutti i PedClientSetting del cliente (tutti gli owner), visibili a tutti. */
export async function getPedMonthForClient(clientId: string, year: number, month: number) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error('Non autorizzato')

  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const lastDay = new Date(Date.UTC(year, month, 0))
  const daysToSunday = (7 - lastDay.getUTCDay()) % 7
  const startMs = Date.UTC(year, month - 1, 1 - firstWeekday, 0, 0, 0, 0)
  const endMs = lastDay.getTime() + daysToSunday * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999
  const startDate = new Date(startMs)
  const endDate = new Date(endMs)

  const [allItemsRaw, clientSettings] = await Promise.all([
    prisma.pedItem.findMany({
    where: {
      clientId,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      client: { select: { id: true, name: true } },
      work: { select: { id: true, title: true } },
      owner: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  }),
    prisma.pedClientSetting.findMany({
      where: { clientId },
      include: { owner: { select: { id: true, name: true } } },
    }),
  ])

  const labelOrder = (item: (typeof allItemsRaw)[0]) => PED_LABEL_ORDER[getEffectiveLabel(item)] ?? 1
  const items = [...allItemsRaw].sort((a, b) => {
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (da !== db) return da - db
    const orderA = labelOrder(a)
    const orderB = labelOrder(b)
    if (orderA !== orderB) return orderA - orderB
    const soA = a.sortOrder ?? 0
    const soB = b.sortOrder ?? 0
    if (soA !== soB) return soA - soB
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount: number }> = {}
  const weekMap = new Map<string, { total: number; done: number }>()
  let monthlyTotal = 0
  let monthlyDone = 0

  for (const item of items) {
    const dayKey = toDateString(new Date(item.date))
    if (!dailyStats[dayKey]) dailyStats[dayKey] = { total: 0, done: 0, remainingPct: 0, remainingCount: 0 }
    dailyStats[dayKey].total++
    if (item.status === 'DONE') dailyStats[dayKey].done++
    monthlyTotal++
    if (item.status === 'DONE') monthlyDone++

    const weekStart = getISOWeekStart(new Date(item.date))
    const weekKey = toDateString(weekStart)
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, { total: 0, done: 0 })
    const w = weekMap.get(weekKey)!
    w.total++
    if (item.status === 'DONE') w.done++
  }

  for (const key of Object.keys(dailyStats)) {
    const s = dailyStats[key]
    s.remainingCount = s.total - s.done
    s.remainingPct = s.total === 0 ? 0 : Math.round((s.remainingCount / s.total) * 100)
  }

  const weeklyStats = Array.from(weekMap.entries()).map(([weekStart, { total, done }]) => {
    const d = new Date(weekStart + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() + 6)
    return {
      weekStart,
      weekEnd: toDateString(d),
      total,
      done,
    }
  })

  return {
    pedItems: items,
    pedClientSettings: clientSettings,
    computedStats: {
      dailyStats,
      weeklyStats,
      monthlyStats: { total: monthlyTotal, done: monthlyDone },
    },
  }
}

/** Riempe il mese solo per un cliente (stessa logica giorni di fillPedMonth). Le task compaiono anche nel PED generale. */
export async function fillPedMonthForClient(clientId: string, year: number, month: number) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const setting = await prisma.pedClientSetting.findUnique({
    where: { ownerId_clientId: { ownerId, clientId } },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!setting || ![4, 6, 8, 12].includes(setting.contentsPerWeek)) {
    throw new Error('Imposta prima i contenuti/mese a 4, 6, 8 o 12 nella sezione PED di questo cliente.')
  }

  const startStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`
  const items = await prisma.pedItem.findMany({
    where: {
      ownerId,
      clientId,
      date: { gte: new Date(startStr), lte: new Date(endStr) },
      isExtra: false,
    },
    select: { date: true },
  })
  const rows = items.map((i) => ({ dateKey: i.date.toISOString().slice(0, 10) }))
  const existingDates = new Set(rows.map((r) => r.dateKey))

  const dateKeys = getTargetDateKeysForContents(year, month, setting.contentsPerWeek)
  const targetPerWeek = new Map<string, number>()
  for (const dk of dateKeys) {
    const weekStart = toDateString(getISOWeekStart(new Date(dk + 'T00:00:00.000Z')))
    targetPerWeek.set(weekStart, (targetPerWeek.get(weekStart) ?? 0) + 1)
  }
  const existingPerWeek = new Map<string, number>()
  for (const r of rows) {
    const weekStart = toDateString(getISOWeekStart(new Date(r.dateKey + 'T00:00:00.000Z')))
    existingPerWeek.set(weekStart, (existingPerWeek.get(weekStart) ?? 0) + 1)
  }
  let allFilled = true
  for (const [weekStart, required] of targetPerWeek) {
    if ((existingPerWeek.get(weekStart) ?? 0) < required) {
      allFilled = false
      break
    }
  }
  if (allFilled) {
    revalidatePath('/ped')
    throw new Error('Mese già riempito')
  }

  for (const dateKey of dateKeys) {
    if (existingDates.has(dateKey)) continue
    await createPedItem({
      clientId: setting.clientId,
      date: dateKey,
      kind: 'CONTENT',
      type: 'POST',
      title: setting.client.name,
      description: null,
      priority: 'MEDIUM',
      isExtra: false,
    })
    existingDates.add(dateKey)
  }
  revalidatePath('/ped')
}

/** Svuota il mese nel PED generale: elimina tutte le task del mese (dell'utente). */
export async function emptyPedMonth(year: number, month: number) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999))

  await prisma.pedItem.deleteMany({
    where: { ownerId, date: { gte: startDate, lte: endDate } },
  })
  revalidatePath('/ped')
}

/** Svuota il mese solo per un cliente: elimina tutte le task di quel cliente nel mese. */
export async function emptyPedMonthForClient(clientId: string, year: number, month: number) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999))

  await prisma.pedItem.deleteMany({
    where: { ownerId, clientId, date: { gte: startDate, lte: endDate } },
  })
  revalidatePath('/ped')
  revalidatePath(`/clients/${clientId}`)
}

export async function upsertPedClientSetting(clientId: string, contentsPerWeek: number) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const validated = pedClientSettingSchema.parse({ clientId, contentsPerWeek })

  await prisma.pedClientSetting.upsert({
    where: {
      ownerId_clientId: { ownerId, clientId: validated.clientId },
    },
    create: {
      ownerId,
      clientId: validated.clientId,
      contentsPerWeek: validated.contentsPerWeek,
    },
    update: { contentsPerWeek: validated.contentsPerWeek },
  })

  revalidatePath('/ped')
  revalidatePath(`/clients/${clientId}`)
}

export async function removePedClientSetting(clientId: string) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  await prisma.pedClientSetting.deleteMany({
    where: { ownerId, clientId },
  })

  revalidatePath('/ped')
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00.000Z')
  if (isNaN(d.getTime())) throw new Error('Data non valida')
  return d
}

export async function createPedItem(payload: unknown) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const validated = pedItemCreateSchema.parse(payload)
  const date = parseDate(validated.date)
  const assignedToUserId = validated.assignedToUserId ?? ownerId

  if (validated.workId) {
    const work = await prisma.work.findUnique({ where: { id: validated.workId } })
    if (!work) throw new Error('Lavoro non trovato')
  }

  const isExtra = validated.isExtra ?? false
  const dayStart = new Date(date)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setUTCHours(23, 59, 59, 999)
  const allOwnerItemsRaw = await prisma.pedItem.findMany({
    where: { ownerId },
  })
  const allOwnerItems = allOwnerItemsRaw.filter(
    (item) => item.assignedToUserId === ownerId || item.assignedToUserId === null
  )
  const sameDay = allOwnerItems.filter(
    (item) =>
      item.isExtra === isExtra &&
      new Date(item.date).getTime() >= dayStart.getTime() &&
      new Date(item.date).getTime() <= dayEnd.getTime()
  )
  const maxOrder = sameDay.length > 0 ? Math.max(...sameDay.map((i) => i.sortOrder ?? 0)) : -1
  const sortOrder = maxOrder + 1

  await ensureSortOrderColumn()

  const id = randomUUID()
  const dateStr = date.toISOString().slice(0, 19).replace('T', ' ')
  const desc = validated.description?.trim() || null
  const workId = validated.workId ?? null
  const assignedTo = assignedToUserId ?? null

  const label = validated.label ?? DEFAULT_LABEL
  const status = label === DONE_LABEL ? 'DONE' : 'TODO'
  await prisma.pedItem.create({
    data: {
      id,
      ownerId,
      assignedToUserId: assignedTo,
      clientId: validated.clientId,
      date: new Date(dateStr),
      kind: validated.kind,
      type: validated.type,
      title: validated.title,
      description: desc,
      priority: validated.priority ?? 'MEDIUM',
      label,
      status,
      workId,
      isExtra: !!isExtra,
      sortOrder,
    },
  })

  revalidatePath('/ped')
}

export async function updatePedItem(id: string, payload: unknown) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const existing = await prisma.pedItem.findUnique({
    where: { id },
    select: { ownerId: true, assignedToUserId: true },
  })
  const canEdit = existing && (existing.ownerId === ownerId || existing.assignedToUserId === ownerId)
  if (!canEdit) throw new Error('Non autorizzato')

  const validated = pedItemUpdateSchema.parse(payload)

  // Costruiamo solo i campi da aggiornare con tipo Prisma esplicito (evita "Invalid invocation")
  const data: Prisma.PedItemUncheckedUpdateInput = {}
  if (validated.date !== undefined) {
    const d = parseDate(validated.date)
    // Passiamo come stringa ISO per evitare problemi di serializzazione nelle server action
    data.date = d.toISOString().slice(0, 10) + 'T00:00:00.000Z'
  }
  if (validated.isExtra !== undefined) data.isExtra = validated.isExtra
  if (validated.clientId !== undefined) data.clientId = validated.clientId
  if (validated.kind !== undefined) data.kind = validated.kind
  if (validated.type !== undefined) data.type = validated.type
  if (validated.title !== undefined) data.title = validated.title
  if (validated.description !== undefined) data.description = validated.description
  if (validated.priority !== undefined) data.priority = validated.priority
  if (validated.label !== undefined) {
    data.label = validated.label
    data.status = validated.label === DONE_LABEL ? 'DONE' : 'TODO'
  }
  if (validated.status !== undefined) data.status = validated.status
  if (validated.workId !== undefined) {
    if (validated.workId) {
      const work = await prisma.work.findUnique({ where: { id: validated.workId } })
      if (!work) throw new Error('Lavoro non trovato')
    }
    data.workId = validated.workId
  }
  if (validated.assignedToUserId !== undefined) data.assignedToUserId = validated.assignedToUserId

  if (Object.keys(data).length === 0) return

  await prisma.pedItem.update({
    where: { id },
    data,
  })

  revalidatePath('/ped')
}

/** Imposta l'etichetta di una task (es. da context menu). Sincronizza status DONE se label = FATTO. */
export async function setPedItemLabel(id: string, label: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, error: 'Non autorizzato' }

    const validated = pedItemSetLabelSchema.parse({ id, label })

    const existing = await prisma.pedItem.findUnique({
      where: { id },
      select: { ownerId: true, assignedToUserId: true },
    })
    const canEdit = existing && (existing.ownerId === ownerId || existing.assignedToUserId === ownerId)
    if (!canEdit) return { ok: false, error: 'Non autorizzato' }

    const status = validated.label === DONE_LABEL ? 'DONE' : 'TODO'
    await prisma.pedItem.update({
      where: { id },
      data: { label: validated.label, status },
    })

    revalidatePath('/ped')
    return { ok: true }
  } catch (err) {
    console.error('[setPedItemLabel]', id, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Errore nel salvataggio' }
  }
}

async function canEditPedItem(id: string, ownerId: string): Promise<boolean> {
  const item = await prisma.pedItem.findUnique({
    where: { id },
    select: { ownerId: true, assignedToUserId: true },
  })
  return !!(item && (item.ownerId === ownerId || item.assignedToUserId === ownerId))
}

/** Applica etichetta a più task. */
export async function bulkSetPedItemLabel(ids: string[], label: string): Promise<{ applied: number; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { applied: 0, error: 'Non autorizzato' }
    if (!label || !PED_LABELS.includes(label as (typeof PED_LABELS)[number])) return { applied: 0, error: 'Etichetta non valida' }
    const status = label === DONE_LABEL ? 'DONE' : 'TODO'
    let applied = 0
    for (const id of ids) {
      if (!(await canEditPedItem(id, ownerId))) continue
      await prisma.pedItem.update({
        where: { id },
        data: { label, status },
      })
      applied++
    }
    revalidatePath('/ped')
    return { applied }
  } catch (err) {
    console.error('[bulkSetPedItemLabel]', err)
    return { applied: 0, error: err instanceof Error ? err.message : 'Errore' }
  }
}

/** Segna come fatto/non fatto più task. */
export async function bulkTogglePedItemDone(ids: string[], done: boolean): Promise<{ applied: number; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { applied: 0, error: 'Non autorizzato' }
    const status = done ? 'DONE' : 'TODO'
    const label = done ? DONE_LABEL : DEFAULT_LABEL
    let applied = 0
    for (const id of ids) {
      if (!(await canEditPedItem(id, ownerId))) continue
      await prisma.pedItem.update({
        where: { id },
        data: { status, label },
      })
      applied++
    }
    revalidatePath('/ped')
    return { applied }
  } catch (err) {
    console.error('[bulkTogglePedItemDone]', err)
    return { applied: 0, error: err instanceof Error ? err.message : 'Errore' }
  }
}

/** Elimina più task. */
export async function bulkDeletePedItems(ids: string[]): Promise<{ applied: number; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { applied: 0, error: 'Non autorizzato' }
    let applied = 0
    for (const id of ids) {
      if (!(await canEditPedItem(id, ownerId))) continue
      await prisma.pedItem.delete({ where: { id } })
      applied++
    }
    revalidatePath('/ped')
    return { applied }
  } catch (err) {
    console.error('[bulkDeletePedItems]', err)
    return { applied: 0, error: err instanceof Error ? err.message : 'Errore' }
  }
}

/** Sposta più task sulla stessa data. */
export async function bulkMovePedItems(ids: string[], targetDate: string, targetIsExtra: boolean): Promise<{ applied: number; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { applied: 0, error: 'Non autorizzato' }
    const date = parseDate(targetDate)
    const dateStr = date.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    let applied = 0
    for (const id of ids) {
      if (!(await canEditPedItem(id, ownerId))) continue
      await prisma.pedItem.update({
        where: { id },
        data: { date: new Date(dateStr), isExtra: targetIsExtra },
      })
      applied++
    }
    revalidatePath('/ped')
    return { applied }
  } catch (err) {
    console.error('[bulkMovePedItems]', err)
    return { applied: 0, error: err instanceof Error ? err.message : 'Errore' }
  }
}

export async function reorderPedItemsInDay(dateKey: string, isExtra: boolean, orderedItemIds: string[]) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')
  if (orderedItemIds.length === 0) return

  const itemsRaw = await prisma.pedItem.findMany({
    where: { id: { in: orderedItemIds } },
    select: { id: true, date: true, isExtra: true, ownerId: true, assignedToUserId: true },
  })
  const items = itemsRaw.filter(
    (item) => item.ownerId === ownerId || item.assignedToUserId === ownerId
  )
  const dateStr = dateKey.slice(0, 10)
  for (const item of items) {
    if (item.isExtra !== isExtra) throw new Error('Item non appartiene a questo slot')
    if (isExtra) {
      const weekStart = toDateString(getISOWeekStart(new Date(item.date)))
      if (weekStart !== dateStr) throw new Error('Item non appartiene a questa settimana')
    } else {
      const itemDateStr = new Date(item.date).toISOString().slice(0, 10)
      if (itemDateStr !== dateStr) throw new Error('Item non appartiene a questo giorno')
    }
  }
  if (items.length !== orderedItemIds.length) throw new Error('Lista non valida')

  for (let i = 0; i < orderedItemIds.length; i++) {
    await prisma.pedItem.update({
      where: { id: orderedItemIds[i] },
      data: { sortOrder: i },
    })
  }
  revalidatePath('/ped')
}

export async function deletePedItem(id: string) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const existing = await prisma.pedItem.findUnique({
    where: { id },
    select: { ownerId: true, assignedToUserId: true },
  })
  const canDelete = existing && (existing.ownerId === ownerId || existing.assignedToUserId === ownerId)
  if (!canDelete) throw new Error('Non autorizzato')

  await prisma.pedItem.delete({ where: { id } })
  revalidatePath('/ped')
}

export async function togglePedItemDone(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, error: 'Non autorizzato' }

    const item = await prisma.pedItem.findUnique({
      where: { id },
      select: { ownerId: true, assignedToUserId: true, status: true, label: true },
    })
    const canToggle = item && (item.ownerId === ownerId || item.assignedToUserId === ownerId)
    if (!canToggle) return { ok: false, error: 'Non autorizzato' }

    const newStatus = item.status === 'DONE' ? 'TODO' : 'DONE'
    const newLabel = newStatus === 'DONE' ? DONE_LABEL : DEFAULT_LABEL
    await prisma.pedItem.update({
      where: { id },
      data: { status: newStatus, label: newLabel },
    })

    revalidatePath('/ped')
    return { ok: true }
  } catch (err) {
    console.error('[togglePedItemDone]', id, err)
    return { ok: false, error: err instanceof Error ? err.message : 'Errore nel salvataggio' }
  }
}

export async function duplicatePedItem(id: string, targetDate: string, targetIsExtra?: boolean) {
  const ownerId = await getOwnerId()
  if (!ownerId) throw new Error('Non autorizzato')

  const source = await prisma.pedItem.findUnique({
    where: { id },
  })
  const canDuplicate = source && (source.ownerId === ownerId || source.assignedToUserId === ownerId)
  if (!canDuplicate) throw new Error('Non autorizzato')

  const date = parseDate(targetDate)
  const isExtra = targetIsExtra !== undefined ? targetIsExtra : source.isExtra
  const dayStart = new Date(date)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setUTCHours(23, 59, 59, 999)
  const allOwnerItemsRaw = await prisma.pedItem.findMany({
    where: { ownerId },
  })
  const allOwnerItems = allOwnerItemsRaw.filter(
    (item) => item.assignedToUserId === ownerId || item.assignedToUserId === null
  )
  const sameDay = allOwnerItems.filter(
    (item) =>
      item.isExtra === isExtra &&
      new Date(item.date).getTime() >= dayStart.getTime() &&
      new Date(item.date).getTime() <= dayEnd.getTime()
  )
  const maxOrder = sameDay.length > 0 ? Math.max(...sameDay.map((i) => i.sortOrder ?? 0)) : -1
  const sortOrder = maxOrder + 1

  await ensureSortOrderColumn()

  const newId = randomUUID()
  const dateStr = date.toISOString().slice(0, 19).replace('T', ' ')
  const desc = source.description ?? null
  const workId = source.workId ?? null
  const assignedTo = ownerId

  const sourceLabel = getEffectiveLabel(source)
  const dupLabel = sourceLabel === DONE_LABEL ? DEFAULT_LABEL : sourceLabel
  await prisma.pedItem.create({
    data: {
      id: newId,
      ownerId,
      assignedToUserId: assignedTo,
      clientId: source.clientId,
      date: new Date(dateStr),
      kind: source.kind,
      type: source.type,
      title: source.title + ' (copia)',
      description: desc,
      priority: source.priority,
      label: dupLabel,
      status: 'TODO',
      workId,
      isExtra: !!isExtra,
      sortOrder,
    },
  })

  revalidatePath('/ped')
}
