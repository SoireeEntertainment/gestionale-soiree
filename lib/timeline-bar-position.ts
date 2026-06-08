import {
  diffCalendarDaysLocal,
  parseDateOnly,
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
 * Bar position from work start/deadline vs visible timeline range (inclusive days).
 * Dates in timeline are treated as date-only to avoid timezone off-by-one.
 *
 * left  = startOffset / rangeDays
 * width = (endOffset - startOffset + 1) / rangeDays  (both ends inclusive)
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

  const rangeDays = diffCalendarDaysLocal(rangeStartDay, rangeEndDay) + 1
  if (rangeDays <= 0) {
    return { leftPercent: 0, widthPercent: MIN_WIDTH_PERCENT, continuesBefore: false, continuesAfter: false }
  }

  let endDay = end
  if (end.getTime() < start.getTime()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[timeline] deadline before startDate', { start, end })
    }
    endDay = start
  }

  const continuesBefore = diffCalendarDaysLocal(start, rangeStartDay) > 0
  const continuesAfter = diffCalendarDaysLocal(endDay, rangeEndDay) < 0

  // Work completely before or after visible range
  if (diffCalendarDaysLocal(endDay, rangeStartDay) > 0 || diffCalendarDaysLocal(start, rangeEndDay) < 0) {
    return { leftPercent: 0, widthPercent: MIN_WIDTH_PERCENT, continuesBefore, continuesAfter }
  }

  const visibleStart = continuesBefore ? rangeStartDay : start
  const visibleEnd = continuesAfter ? rangeEndDay : endDay

  const startOffset = diffCalendarDaysLocal(rangeStartDay, visibleStart)
  const endOffset = diffCalendarDaysLocal(rangeStartDay, visibleEnd)

  let leftPercent = (startOffset / rangeDays) * 100
  let widthPercent = ((endOffset - startOffset + 1) / rangeDays) * 100

  if (widthPercent < MIN_WIDTH_PERCENT) widthPercent = MIN_WIDTH_PERCENT
  if (leftPercent < 0) leftPercent = 0
  if (leftPercent + widthPercent > 100) widthPercent = 100 - leftPercent

  return { leftPercent, widthPercent, continuesBefore, continuesAfter }
}

/** Self-check bar sizing scenarios from the timeline spec. */
export function runTimelineBarPositionChecks(): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const mayStart = parseDateOnly('2026-05-01')
  const mayEnd = parseDateOnly('2026-05-31')

  const assert = (label: string, cond: boolean, detail?: string) => {
    if (!cond) errors.push(detail ? `${label}: ${detail}` : label)
  }

  // TEST 1: Apr 20 – May 4 in May view → short bar ending May 4
  const t1 = getTimelineBarPosition(parseDateOnly('2026-04-20'), parseDateOnly('2026-05-04'), mayStart, mayEnd)
  assert('TEST1 width < 20%', t1.widthPercent < 20, `width=${t1.widthPercent}`)
  assert('TEST1 left at start', t1.leftPercent < 1, `left=${t1.leftPercent}`)
  assert('TEST1 continues before', t1.continuesBefore)

  // Work May 1 – May 10 in May view
  const t2 = getTimelineBarPosition(parseDateOnly('2026-05-01'), parseDateOnly('2026-05-10'), mayStart, mayEnd)
  assert('May1-10 not full width', t2.widthPercent < 50, `width=${t2.widthPercent}`)
  assert('May1-10 starts at left', t2.leftPercent < 1)

  // Work May 5 – May 10: drag move should keep width (same duration)
  const t3a = getTimelineBarPosition(parseDateOnly('2026-05-05'), parseDateOnly('2026-05-10'), mayStart, mayEnd)
  const t3b = getTimelineBarPosition(parseDateOnly('2026-05-07'), parseDateOnly('2026-05-12'), mayStart, mayEnd)
  assert('drag preserves width', Math.abs(t3a.widthPercent - t3b.widthPercent) < 0.5)

  // Resize deadline +5 days: May 1–10 → May 1–15
  const t4a = getTimelineBarPosition(parseDateOnly('2026-05-01'), parseDateOnly('2026-05-10'), mayStart, mayEnd)
  const t4b = getTimelineBarPosition(parseDateOnly('2026-05-01'), parseDateOnly('2026-05-15'), mayStart, mayEnd)
  assert('resize end grows width', t4b.widthPercent > t4a.widthPercent)

  // Resize start +3: May 1–10 → May 4–10
  const t5a = getTimelineBarPosition(parseDateOnly('2026-05-01'), parseDateOnly('2026-05-10'), mayStart, mayEnd)
  const t5b = getTimelineBarPosition(parseDateOnly('2026-05-04'), parseDateOnly('2026-05-10'), mayStart, mayEnd)
  assert('resize start shifts left', t5b.leftPercent > t5a.leftPercent)
  assert('resize start shrinks width', t5b.widthPercent < t5a.widthPercent)

  return { ok: errors.length === 0, errors }
}
