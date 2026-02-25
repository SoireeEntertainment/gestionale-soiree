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
