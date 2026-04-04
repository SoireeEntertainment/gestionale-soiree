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

const IT_WEEKDAY: Record<string, number> = {
  domenica: 0,
  lunedi: 1,
  lunedì: 1,
  martedi: 2,
  martedì: 2,
  mercoledi: 3,
  mercoledì: 3,
  giovedi: 4,
  giovedì: 4,
  venerdi: 5,
  venerdì: 5,
  sabato: 6,
}

/**
 * Frasi tipo "lunedì prossimo", "martedì prossimo" → YYYY-MM-DD (prossimo occorrenza dopo oggi).
 */
export function parseItalianNextWeekdayPhrase(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  const m = s.match(
    /^(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+prossim[oa]?$/i
  )
  if (!m) return null
  const key = m[1].toLowerCase().normalize('NFD').replace(/\u0300/g, '')
  const wd = IT_WEEKDAY[key]
  if (wd === undefined) return null

  const start = new Date()
  start.setHours(12, 0, 0, 0)
  for (let add = 1; add <= 14; add++) {
    const d = new Date(start)
    d.setDate(d.getDate() + add)
    if (d.getDay() === wd) {
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}-${mo}-${da}`
    }
  }
  return null
}

/** Combina parsing assoluto e relativo settimanale. */
export function parseDeadlineFlexible(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const abs = parseItalianDatePhrase(t)
  if (abs) return abs
  return parseItalianNextWeekdayPhrase(t)
}
