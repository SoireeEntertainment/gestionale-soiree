/**
 * Utility PED: priorità colorate, tipi, date.
 */

/** Sfondo e testo per la voce PED (sfondo intera riga, colori ben visibili). */
export const PED_PRIORITY_COLORS: Record<
  string,
  { bg: string; text: string; label: string; backgroundColor: string; color: string }
> = {
  NOT_URGENT: {
    bg: 'bg-emerald-600/75',
    text: 'text-white',
    label: 'Non urgente',
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    color: '#ffffff',
  },
  MEDIUM: {
    bg: 'bg-amber-500/85',
    text: 'text-gray-900',
    label: 'Media urgenza',
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
    color: '#1f2937',
  },
  URGENT: {
    bg: 'bg-red-600/75',
    text: 'text-white',
    label: 'Urgente',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    color: '#ffffff',
  },
}

/** Stile priorità con fallback a MEDIUM se priority null/undefined/invalida. Usare ovunque per coerenza colori/etichette. */
export function getPriorityStyle(priority: string | null | undefined) {
  const key = priority && priority in PED_PRIORITY_COLORS ? priority : 'MEDIUM'
  return PED_PRIORITY_COLORS[key]
}

/** Stile per voci PED delegate a un altro utente (mostrate nel calendario del proprietario). */
export const PED_DELEGATED_STYLE = {
  backgroundColor: 'rgba(124, 58, 237, 0.9)',
  color: '#ffffff',
} as const

export const PED_ITEM_TYPE_LABELS: Record<string, string> = {
  REEL: 'Reel',
  POST: 'Post',
  STORY: 'Story',
  CAROUSEL: 'Carousel',
  ADV: 'Adv',
  SHOOTING: 'Shooting',
  WEBSITE_TASK: 'Website',
  GRAPHIC_TASK: 'Grafica',
  COPY_TASK: 'Copy',
  MEETING: 'Meeting',
  OTHER: 'Altro',
}

/** Restituisce inizio e fine mese in UTC (per query). */
export function getMonthRangeUTC(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  return { start, end }
}

/** Restituisce inizio e fine della vista calendario (prima settimana → ultima settimana) in UTC. */
export function getCalendarRangeUTC(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const last = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  const firstWeekday = (first.getUTCDay() + 6) % 7
  const start = new Date(first)
  start.setUTCDate(start.getUTCDate() - firstWeekday)
  start.setUTCHours(0, 0, 0, 0)
  const daysToSunday = (7 - last.getUTCDay()) % 7
  const end = new Date(last)
  end.setUTCDate(end.getUTCDate() + daysToSunday)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

/** Chiave YYYY-MM-DD del lunedì ISO per una data YYYY-MM-DD. */
export function getISOWeekStartKey(dateKey: string): string {
  return toDateString(getISOWeekStart(new Date(dateKey + 'T00:00:00.000Z')))
}

/** Crea una data a mezzanotte UTC per un giorno. */
export function dateToUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

/** Formato YYYY-MM-DD per una Date. */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Inizio settimana ISO (lunedì) per una data. */
export function getISOWeekStart(d: Date): Date {
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diff)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

/** Lunedì della settimana corrente (ISO). Restituisce YYYY-MM-DD. */
export function getCurrentWeekStartString(): string {
  return toDateString(getISOWeekStart(new Date()))
}

/** Aggiunge N giorni a una data YYYY-MM-DD, restituisce YYYY-MM-DD. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toDateString(d)
}

/**
 * Date YYYY-MM-DD del mese che cadono nei giorni ISO selezionati (1=lun … 7=dom).
 */
export function getMonthDateKeysForIsoWeekdays(
  year: number,
  month: number,
  isoWeekdays: number[]
): string[] {
  const allowed = new Set(
    isoWeekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  )
  if (allowed.size === 0) return []

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const result: string[] = []
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month - 1, day))
    const utcDow = date.getUTCDay() // 0=dom … 6=sab
    const iso = utcDow === 0 ? 7 : utcDow
    if (allowed.has(iso)) result.push(toDateString(date))
  }
  return result
}

/**
 * Seleziona `count` indici uniformemente lungo `length` elementi (cronologici).
 */
export function pickUniformIndices(length: number, count: number): number[] {
  if (count <= 0 || length <= 0) return []
  if (count >= length) return Array.from({ length }, (_, i) => i)
  const indices: number[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i + 0.5) * (length / count))
    indices.push(Math.min(length - 1, Math.max(0, idx)))
  }
  // Dedup preservando ordine; se collisioni, sposta al successivo libero
  const used = new Set<number>()
  const unique: number[] = []
  for (const idx of indices) {
    let cur = idx
    while (used.has(cur) && cur < length - 1) cur++
    while (used.has(cur) && cur > 0) cur--
    if (!used.has(cur)) {
      used.add(cur)
      unique.push(cur)
    }
  }
  return unique.sort((a, b) => a - b)
}

export type FillMonthPlan =
  | {
      ok: true
      datesToCreate: string[]
      existingCount: number
      target: number
      /** Avviso se non si è raggiunto il target per mancanza di date. */
      warning?: string
    }
  | {
      ok: false
      reason: 'no_weekdays' | 'already_reached' | 'zero_target'
      message: string
      existingCount?: number
      target?: number
    }

/**
 * Piano di riempimento: crea solo le date mancanti sui giorni selezionati,
 * distribuite in modo uniforme, senza duplicare date già occupate.
 */
export function planFillMonthDates(params: {
  year: number
  month: number
  targetCount: number
  publishingWeekdays: number[]
  existingDateKeys: string[]
}): FillMonthPlan {
  const { year, month, targetCount, publishingWeekdays, existingDateKeys } = params
  const existingUnique = Array.from(new Set(existingDateKeys))
  const existingCount = existingUnique.length
  const existingSet = new Set(existingUnique)

  if (targetCount <= 0) {
    return {
      ok: false,
      reason: 'zero_target',
      message: 'Imposta un numero di contenuti/mese maggiore di zero.',
      target: targetCount,
      existingCount,
    }
  }

  if (!publishingWeekdays.length) {
    return {
      ok: false,
      reason: 'no_weekdays',
      message: 'Seleziona almeno un giorno della settimana',
      target: targetCount,
      existingCount,
    }
  }

  if (existingCount >= targetCount) {
    return {
      ok: false,
      reason: 'already_reached',
      message: 'Il cliente ha già raggiunto il numero di contenuti previsto per questo mese',
      target: targetCount,
      existingCount,
    }
  }

  const need = targetCount - existingCount
  const weekdayDates = getMonthDateKeysForIsoWeekdays(year, month, publishingWeekdays)
  const available = weekdayDates.filter((d) => !existingSet.has(d))
  const toPick = Math.min(need, available.length)
  const indices = pickUniformIndices(available.length, toPick)
  const datesToCreate = indices.map((i) => available[i])

  const reachable = existingCount + datesToCreate.length
  const warning =
    reachable < targetCount
      ? `Con i giorni selezionati sono disponibili solo ${reachable} date. Seleziona altri giorni per raggiungere ${targetCount} contenuti.`
      : undefined

  return {
    ok: true,
    datesToCreate,
    existingCount,
    target: targetCount,
    warning,
  }
}
