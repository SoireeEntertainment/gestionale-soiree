/**
 * Parses deadline from datetime-local input (YYYY-MM-DDTHH:mm) to Date.
 * Handles missing seconds (adds :00) and invalid dates.
 */
export function parseDeadlineFromInput(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string' || value.trim() === '') return null
  try {
    let dateString = value.trim()
    if (dateString.includes('T') && !dateString.includes('Z') && !dateString.includes('+')) {
      const colonCount = (dateString.match(/:/g) || []).length
      if (colonCount === 1) dateString = `${dateString}:00`
    }
    const d = new Date(dateString)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const IT_DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const IT_DATETIME_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Data in formato italiano compatto (es. 07 giu 2026). */
export function formatItalianDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  return IT_DATE_FMT.format(d)
}

/** Data e ora in formato italiano. */
export function formatItalianDateTime(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value)
  return IT_DATETIME_FMT.format(d)
}
