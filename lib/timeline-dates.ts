/**
 * Dates in timeline are treated as date-only to avoid timezone off-by-one.
 * Store as YYYY-MM-DD strings in API payloads; persist with dateOnlyToDbDate().
 */

export const MIN_DRAG_PX = 5

/** Parse YYYY-MM-DD as local calendar date (noon local, avoids DST edge cases). */
export function parseDateOnly(dateString: string): Date {
  const [y, m, d] = dateString.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

/** Format a Date as YYYY-MM-DD using local calendar components. */
export function formatDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

/** Parse stored ISO or YYYY-MM-DD into local date-only Date. */
export function parseStoredDate(value: string | Date): Date {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDateOnly(value)
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return parseDateOnly(value.slice(0, 10))
  }
  return startOfLocalDay(value instanceof Date ? value : new Date(value))
}

/** Persist date-only field: noon UTC keeps YYYY-MM-DD stable across timezones. */
export function dateOnlyToDbDate(dateString: string): Date {
  return new Date(`${dateString.slice(0, 10)}T12:00:00.000Z`)
}

/** Read DB date as YYYY-MM-DD (works with noon UTC storage). */
export function dbDateToDateOnly(stored: Date | string): string {
  if (typeof stored === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored
    return stored.slice(0, 10)
  }
  return stored.toISOString().slice(0, 10)
}

export function addDaysLocal(date: Date, days: number): Date {
  const d = startOfLocalDay(date)
  d.setDate(d.getDate() + days)
  return startOfLocalDay(d)
}

export function diffCalendarDaysLocal(a: Date, b: Date): number {
  const aDay = startOfLocalDay(a).getTime()
  const bDay = startOfLocalDay(b).getTime()
  return Math.round((bDay - aDay) / (24 * 60 * 60 * 1000))
}

export function daysInInclusiveRange(rangeStart: Date, rangeEnd: Date): number {
  return diffCalendarDaysLocal(rangeStart, rangeEnd) + 1
}

export function getWorkEffectiveStartDate(work: {
  startDate?: string | Date | null
  createdAt: string | Date
}): Date {
  if (work.startDate) return parseStoredDate(work.startDate)
  return startOfLocalDay(new Date(work.createdAt))
}

export function getWorkEffectiveEndDate(deadline: string | Date): Date {
  return parseStoredDate(deadline)
}

export function snapToDay(date: Date): Date {
  return startOfLocalDay(date)
}

/** @deprecated Use addDaysLocal */
export function addCalendarDays(date: Date, days: number): Date {
  return addDaysLocal(date, days)
}

/** @deprecated Use diffCalendarDaysLocal */
export function calendarDaysBetween(a: Date, b: Date): number {
  return diffCalendarDaysLocal(a, b)
}

export function clampDate(date: Date, min: Date, max: Date): Date {
  const t = startOfLocalDay(date).getTime()
  if (t < startOfLocalDay(min).getTime()) return startOfLocalDay(min)
  if (t > startOfLocalDay(max).getTime()) return startOfLocalDay(max)
  return startOfLocalDay(date)
}

/** Inclusive range: 0% = rangeStart day, 100% = rangeEnd day. */
export function dateToPercent(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const daySpan = diffCalendarDaysLocal(rangeStart, rangeEnd)
  if (daySpan <= 0) return 0
  const dayIndex = diffCalendarDaysLocal(rangeStart, date)
  return (dayIndex / daySpan) * 100
}

export function percentToDate(percent: number, rangeStart: Date, rangeEnd: Date): Date {
  const daySpan = diffCalendarDaysLocal(rangeStart, rangeEnd)
  const dayIndex = Math.round((percent / 100) * daySpan)
  return addDaysLocal(rangeStart, dayIndex)
}

/**
 * Convert horizontal drag distance to calendar-day delta (inclusive range).
 * Uses Math.round so +2 days drag saves exactly +2 days.
 */
export function pixelDeltaToDays(
  deltaPx: number,
  containerWidth: number,
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (containerWidth <= 0) return 0
  const daySpan = diffCalendarDaysLocal(rangeStart, rangeEnd)
  if (daySpan <= 0) return 0
  return Math.round((deltaPx / containerWidth) * daySpan)
}

export function ensureMinDuration(start: Date, end: Date, minDays = 0): { start: Date; end: Date } {
  const s = startOfLocalDay(start)
  let e = startOfLocalDay(end)
  if (e.getTime() < s.getTime()) e = s
  if (minDays > 0 && diffCalendarDaysLocal(s, e) < minDays) {
    e = addDaysLocal(s, minDays)
  }
  return { start: s, end: e }
}

export function toDateInputValue(date: Date): string {
  return formatDateOnly(date)
}

/** Self-check helpers for manual verification in development. */
export function runTimelineDateChecks(): { ok: boolean; errors: string[] } {
  const errors: string[] = []

  const assert = (label: string, actual: string, expected: string) => {
    if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${actual}`)
  }

  assert('addDaysLocal +2 deadline', formatDateOnly(addDaysLocal(parseDateOnly('2026-06-10'), 2)), '2026-06-12')
  assert('addDaysLocal +15 deadline', formatDateOnly(addDaysLocal(parseDateOnly('2026-06-10'), 15)), '2026-06-25')
  assert('addDaysLocal +2 start', formatDateOnly(addDaysLocal(parseDateOnly('2026-06-01'), 2)), '2026-06-03')
  assert(
    'drag move +2',
    formatDateOnly(addDaysLocal(parseDateOnly('2026-06-01'), 2)),
    '2026-06-03'
  )
  assert(
    'drag move deadline +2',
    formatDateOnly(addDaysLocal(parseDateOnly('2026-06-10'), 2)),
    '2026-06-12'
  )

  const stored = dateOnlyToDbDate('2026-06-12')
  assert('db round-trip', dbDateToDateOnly(stored), '2026-06-12')
  assert('parse stored ISO', formatDateOnly(parseStoredDate(stored.toISOString())), '2026-06-12')

  const june = parseDateOnly('2026-06-01')
  const juneEnd = parseDateOnly('2026-06-30')
  assert('pixel +2 in june', String(pixelDeltaToDays(2 / 29 * 1000, 1000, june, juneEnd)), '2')

  return { ok: errors.length === 0, errors }
}
