const MIN_WIDTH_PERCENT = 1.5

export type TimelineBarPosition = {
  leftPercent: number
  widthPercent: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export function getTimelineBarPosition(
  workStart: Date,
  workEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): TimelineBarPosition {
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime()
  if (rangeMs <= 0) {
    return { leftPercent: 0, widthPercent: MIN_WIDTH_PERCENT, continuesBefore: false, continuesAfter: false }
  }

  let start = workStart
  let end = workEnd

  if (end.getTime() < start.getTime()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[timeline] deadline before createdAt', { start, end })
    }
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  const continuesBefore = start.getTime() < rangeStart.getTime()
  const continuesAfter = end.getTime() > rangeEnd.getTime()

  const visibleStart = new Date(Math.max(start.getTime(), rangeStart.getTime()))
  const visibleEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()))

  let leftPercent = ((visibleStart.getTime() - rangeStart.getTime()) / rangeMs) * 100
  let widthPercent = ((visibleEnd.getTime() - visibleStart.getTime()) / rangeMs) * 100

  if (widthPercent < MIN_WIDTH_PERCENT) widthPercent = MIN_WIDTH_PERCENT
  if (leftPercent < 0) leftPercent = 0
  if (leftPercent + widthPercent > 100) widthPercent = 100 - leftPercent

  return { leftPercent, widthPercent, continuesBefore, continuesAfter }
}
