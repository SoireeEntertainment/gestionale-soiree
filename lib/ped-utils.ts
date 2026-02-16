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
