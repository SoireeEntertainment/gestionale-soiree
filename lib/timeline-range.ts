import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { it } from 'date-fns/locale'

export type TimelineViewUnit = 'day' | 'week' | 'month' | 'year'

export function parseTimelinePeriod(raw?: string | null): TimelineViewUnit {
  if (raw === 'day' || raw === 'week' || raw === 'month' || raw === 'year') return raw
  return 'month'
}

/** @deprecated Use parseTimelinePeriod — `view` on /works is timeline|list */
export const parseTimelineView = parseTimelinePeriod

export function parseAnchorDate(raw?: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
}

export function formatAnchorDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getTimelineRange(
  view: TimelineViewUnit,
  anchor: Date
): { start: Date; end: Date; label: string } {
  switch (view) {
    case 'day':
      return {
        start: startOfDay(anchor),
        end: endOfDay(anchor),
        label: format(anchor, 'EEEE d MMMM yyyy', { locale: it }),
      }
    case 'week': {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      const end = endOfWeek(anchor, { weekStartsOn: 1 })
      return {
        start,
        end,
        label: `${format(start, 'd MMM', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`,
      }
    }
    case 'month':
      return {
        start: startOfMonth(anchor),
        end: endOfMonth(anchor),
        label: format(anchor, 'MMMM yyyy', { locale: it }),
      }
    case 'year':
      return {
        start: startOfYear(anchor),
        end: endOfYear(anchor),
        label: format(anchor, 'yyyy'),
      }
  }
}

export function navigateTimeline(view: TimelineViewUnit, anchor: Date, direction: -1 | 1): Date {
  const delta = direction === -1 ? -1 : 1
  switch (view) {
    case 'day':
      return addDays(anchor, delta)
    case 'week':
      return addWeeks(anchor, delta)
    case 'month':
      return addMonths(anchor, delta)
    case 'year':
      return addYears(anchor, delta)
  }
}

export type TimelineTick = { date: Date; label: string; percent: number }

export function getTimelineTicks(view: TimelineViewUnit, start: Date, end: Date): TimelineTick[] {
  const rangeMs = end.getTime() - start.getTime()
  if (rangeMs <= 0) return []

  const toPercent = (date: Date) => ((date.getTime() - start.getTime()) / rangeMs) * 100

  switch (view) {
    case 'day':
      return [
        { date: start, label: format(start, 'HH:mm'), percent: 0 },
        { date: end, label: '24:00', percent: 100 },
      ]
    case 'week':
      return eachDayOfInterval({ start, end }).map((date) => ({
        date,
        label: format(date, 'EEE d', { locale: it }),
        percent: toPercent(startOfDay(date)),
      }))
    case 'month': {
      const days = eachDayOfInterval({ start, end })
      const step = days.length > 20 ? 5 : days.length > 10 ? 3 : 1
      return days
        .filter((_, i) => i % step === 0 || i === days.length - 1)
        .map((date) => ({
          date,
          label: format(date, 'd MMM', { locale: it }),
          percent: toPercent(startOfDay(date)),
        }))
    }
    case 'year':
      return eachMonthOfInterval({ start, end }).map((date) => ({
        date,
        label: format(date, 'MMM', { locale: it }),
        percent: toPercent(startOfMonth(date)),
      }))
  }
}

export function getTodayLinePercent(start: Date, end: Date, now = new Date()): number | null {
  const t = now.getTime()
  if (t < start.getTime() || t > end.getTime()) return null
  return ((t - start.getTime()) / (end.getTime() - start.getTime())) * 100
}
