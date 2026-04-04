/** Parsing date in italiano tipo "15 marzo", "20 marzo 2026", "15/03/2026". */

const IT_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Restituisce YYYY-MM-DD in UTC (solo data) o null.
 * @param refYear anno usato se l'anno non è nel testo (es. "15 marzo")
 */
export function parseItalianDatePhrase(raw: string, refYear?: number): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null

  const dmY = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmY) {
    const d = parseInt(dmY[1], 10)
    const m = parseInt(dmY[2], 10)
    const y = parseInt(dmY[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`
  }

  const year = refYear ?? new Date().getFullYear()
  const withYear = s.match(/^(\d{1,2})\s+([a-zà]+)\s+(\d{4})$/i)
  if (withYear) {
    const d = parseInt(withYear[1], 10)
    const mon = IT_MONTHS[withYear[2] as keyof typeof IT_MONTHS]
    const y = parseInt(withYear[3], 10)
    if (mon && d >= 1 && d <= 31) return `${y}-${pad(mon)}-${pad(d)}`
  }

  const noYear = s.match(/^(\d{1,2})\s+([a-zà]+)$/i)
  if (noYear) {
    const d = parseInt(noYear[1], 10)
    const mon = IT_MONTHS[noYear[2] as keyof typeof IT_MONTHS]
    if (mon && d >= 1 && d <= 31) return `${year}-${pad(mon)}-${pad(d)}`
  }

  return null
}
