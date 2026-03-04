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

/**
 * Converte target contenuti/settimana in contenuti/mese (MVP: 4 settimane).
 * Usare per visualizzazione "Target contenuti/mese" in scheda cliente.
 */
export function contentsPerWeekToContentsPerMonth(contentsPerWeek: number): number {
  return Math.round(contentsPerWeek * 4)
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
 * Preset 10 contenuti/mese: restituisce le 10 date target per il mese (solo settimane 1-4).
 * - Settimane 1 e 3: Lunedì, Mercoledì, Venerdì (3+3 = 6)
 * - Settimane 2 e 4: Martedì, Giovedì (2+2 = 4)
 * Settimane = come nel PED (inizio settimana = lunedì ISO).
 * Se un giorno target cade fuori dal mese, usa il primo giorno lavorativo (lun-ven) della stessa settimana nel mese non ancora usato.
 */
export function getTenContentsPerMonthTargetDates(year: number, month: number): string[] {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const week1Monday = getISOWeekStart(monthStart)
  const targets: string[] = []
  const used = new Set<string>()
  const weekdaysByWeek: (1 | 2 | 3 | 4 | 5)[][] = [
    [1, 3, 5],
    [2, 4],
    [1, 3, 5],
    [2, 4],
  ]
  for (let wi = 0; wi < 4; wi++) {
    const weekStart = new Date(week1Monday)
    weekStart.setUTCDate(weekStart.getUTCDate() + wi * 7)
    const wanted = weekdaysByWeek[wi]
    for (const utcDayOfWeek of wanted) {
      const dayOffset = utcDayOfWeek - 1
      const candidate = new Date(weekStart)
      candidate.setUTCDate(weekStart.getUTCDate() + dayOffset)
      const candidateStr = toDateString(candidate)
      const inMonth = candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1
      if (inMonth && !used.has(candidateStr)) {
        targets.push(candidateStr)
        used.add(candidateStr)
      } else {
        const inMonthDays: string[] = []
        for (let d = 0; d < 7; d++) {
          const day = new Date(weekStart)
          day.setUTCDate(weekStart.getUTCDate() + d)
          const dow = day.getUTCDay()
          if (dow >= 1 && dow <= 5 && day.getUTCFullYear() === year && day.getUTCMonth() === month - 1) {
            inMonthDays.push(toDateString(day))
          }
        }
        const firstFree = inMonthDays.find((s) => !used.has(s))
        if (firstFree) {
          targets.push(firstFree)
          used.add(firstFree)
        }
      }
    }
  }
  return targets.slice(0, 10)
}
