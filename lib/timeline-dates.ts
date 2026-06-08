import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'

export const MIN_DRAG_PX = 5
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getWorkEffectiveStartDate(work: {
  startDate?: string | Date | null
  createdAt: string | Date
}): Date {
  if (work.startDate) return startOfDay(new Date(work.startDate))
  return startOfDay(new Date(work.createdAt))
}

export function getWorkEffectiveEndDate(deadline: string | Date): Date {
  return startOfDay(new Date(deadline))
}

export function snapToDay(date: Date): Date {
  return startOfDay(date)
}

export function addCalendarDays(date: Date, days: number): Date {
  return startOfDay(addDays(date, days))
}

export function calendarDaysBetween(a: Date, b: Date): number {
  return differenceInCalendarDays(startOfDay(b), startOfDay(a))
}

export function clampDate(date: Date, min: Date, max: Date): Date {
  const t = date.getTime()
  if (t < min.getTime()) return new Date(min)
  if (t > max.getTime()) return new Date(max)
  return date
}

export function dateToPercent(date: Date, rangeStart: Date, rangeEnd: Date): number {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  if (rangeMs <= 0) return 0
  return ((date.getTime() - rangeStart.getTime()) / rangeMs) * 100
}

export function percentToDate(percent: number, rangeStart: Date, rangeEnd: Date): Date {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  const ms = rangeStart.getTime() + (percent / 100) * rangeMs
  return snapToDay(new Date(ms))
}

/** Converte spostamento orizzontale in pixel in delta giorni (snap giorno). */
export function pixelDeltaToDays(
  deltaPx: number,
  containerWidth: number,
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (containerWidth <= 0) return 0
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  if (rangeMs <= 0) return 0
  const deltaMs = (deltaPx / containerWidth) * rangeMs
  return Math.round(deltaMs / MS_PER_DAY)
}

export function ensureMinDuration(start: Date, end: Date, minDays = 0): { start: Date; end: Date } {
  const s = snapToDay(start)
  let e = snapToDay(end)
  if (e.getTime() < s.getTime()) e = s
  if (minDays > 0 && calendarDaysBetween(s, e) < minDays) {
    e = addCalendarDays(s, minDays)
  }
  return { start: s, end: e }
}

export function toDateInputValue(date: Date): string {
  return startOfDay(date).toISOString().slice(0, 10)
}
