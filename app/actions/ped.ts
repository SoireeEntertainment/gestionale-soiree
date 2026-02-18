'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { toDateString, getISOWeekStart } from '@/lib/ped-utils'
import { pedClientSettingSchema, pedItemCreateSchema, pedItemUpdateSchema } from '@/lib/validations'

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

  // Ordine nella giornata: divisi per colore (URGENT → MEDIUM → NOT_URGENT), completate (DONE) in fondo; dentro ogni gruppo ordine alfabetico per titolo
  const priorityRank = (p: string) => ({ URGENT: 0, MEDIUM: 1, NOT_URGENT: 2 }[p] ?? 1)
  const items = filtered.sort((a, b) => {
    const da = new Date(a.date).getTime()
    const db = new Date(b.date).getTime()
    if (da !== db) return da - db
    const doneA = a.status === 'DONE' ? 1 : 0
    const doneB = b.status === 'DONE' ? 1 : 0
    if (doneA !== doneB) return doneA - doneB
    const prioA = priorityRank(a.priority)
    const prioB = priorityRank(b.priority)
    if (prioA !== prioB) return prioA - prioB
    return (a.title || '').localeCompare(b.title || '', 'it')
  })

  const dailyStats: Record<string, { total: number; done: number; remainingPct: number }> = {}
  const weekMap = new Map<string, { total: number; done: number }>()
  let monthlyTotal = 0
  let monthlyDone = 0

  for (const item of items) {
    const dayKey = toDateString(new Date(item.date))
    if (!dailyStats[dayKey]) dailyStats[dayKey] = { total: 0, done: 0, remainingPct: 0 }
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
    s.remainingPct = s.total === 0 ? 0 : Math.round(((s.total - s.done) / s.total) * 100)
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
      priority: validated.priority,
      status: 'TODO',
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
      select: { ownerId: true, assignedToUserId: true, status: true },
    })
    const canToggle = item && (item.ownerId === ownerId || item.assignedToUserId === ownerId)
    if (!canToggle) return { ok: false, error: 'Non autorizzato' }

    const newStatus = item.status === 'DONE' ? 'TODO' : 'DONE'
    await prisma.pedItem.update({
      where: { id },
      data: { status: newStatus },
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
      status: 'TODO',
      workId,
      isExtra: !!isExtra,
      sortOrder,
    },
  })

  revalidatePath('/ped')
}
