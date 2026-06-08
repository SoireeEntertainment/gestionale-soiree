import {
  diffCalendarDaysLocal,
  startOfLocalDay,
} from '@/lib/timeline-dates'

const MIN_WIDTH_PERCENT = 1.5

export type TimelineBarPosition = {
  leftPercent: number
  widthPercent: number
  continuesBefore: boolean
  continuesAfter: boolean
}

/**
 * Bar position using inclusive calendar days (0% = rangeStart, 100% = rangeEnd).
 * Dates in timeline are treated as date-only to avoid timezone off-by-one.
 */
export function getTimelineBarPosition(
  workStart: Date,
  workEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): TimelineBarPosition {
  const start = startOfLocalDay(workStart)
  const end = startOfLocalDay(workEnd)
  const rangeStartDay = startOfLocalDay(rangeStart)
  const rangeEndDay = startOfLocalDay(rangeEnd)

  const daySpan = diffCalendarDaysLocal(rangeStartDay, rangeEndDay)
  if (daySpan <= 0) {
    return { leftPercent: 0, widthPercent: MIN_WIDTH_PERCENT, continuesBefore: false, continuesAfter: false }
  }

  let endDay = end
  if (end.getTime() < start.getTime()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[timeline] deadline before startDate', { start, end })
    }
    endDay = start
  }

  const continuesBefore = diffCalendarDaysLocal(start, rangeStartDay) < 0
  const continuesAfter = diffCalendarDaysLocal(endDay, rangeEndDay) > 0

  const visibleStart = continuesBefore ? rangeStartDay : start
  const visibleEnd = continuesAfter ? rangeEndDay : endDay

  const leftIndex = Math.max(0, diffCalendarDaysLocal(rangeStartDay, visibleStart))
  const rightIndex = Math.min(daySpan, diffCalendarDaysLocal(rangeStartDay, visibleEnd))

  let leftPercent = (leftIndex / daySpan) * 100
  let widthPercent = ((rightIndex - leftIndex) / daySpan) * 100

  if (widthPercent < MIN_WIDTH_PERCENT) widthPercent = MIN_WIDTH_PERCENT
  if (leftPercent < 0) leftPercent = 0
  if (leftPercent + widthPercent > 100) widthPercent = 100 - leftPercent

  return { leftPercent, widthPercent, continuesBefore, continuesAfter }
}
