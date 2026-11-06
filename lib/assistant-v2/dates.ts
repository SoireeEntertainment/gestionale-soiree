import {
  addDaysLocal,
  formatDateOnly,
  parseDateOnly,
  todayDateOnlyRome,
} from '@/lib/timeline-dates'
import {
  parseItalianDatePhrase,
  parseItalianNextWeekdayPhrase,
} from '@/lib/assistant/parse-it-date'

const WEEKDAY: Record<string, number> = {
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

function nextWeekdayFrom(today: string, weekday: number, allowToday = false): string {
  const start = parseDateOnly(today)
  for (let add = allowToday ? 0 : 1; add <= 14; add++) {
    const d = addDaysLocal(start, add)
    if (d.getDay() === weekday) return formatDateOnly(d)
  }
  return today
}

/**
 * Interpreta frasi relative italiane in YYYY-MM-DD (Europe/Rome).
 * Non usa conversioni UTC che spostano il giorno.
 */
export function resolveItalianDatePhrase(
  raw: string,
  opts?: { today?: string; ambiguousAsNull?: boolean }
): { date: string | null; ambiguous?: boolean; note?: string } {
  const today = opts?.today ?? todayDateOnlyRome()
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return { date: null }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s }

  if (s === 'oggi') return { date: today }
  if (s === 'domani') return { date: formatDateOnly(addDaysLocal(parseDateOnly(today), 1)) }
  if (s === 'dopodomani') return { date: formatDateOnly(addDaysLocal(parseDateOnly(today), 2)) }

  if (/^tra\s+(\d+)\s+giorn[oi]$/.test(s)) {
    const n = Number(s.match(/^tra\s+(\d+)/)![1])
    return { date: formatDateOnly(addDaysLocal(parseDateOnly(today), n)) }
  }

  if (s === 'settimana prossima' || s === 'la settimana prossima') {
    return {
      date: formatDateOnly(addDaysLocal(parseDateOnly(today), 7)),
      note: 'Interpretato come +7 giorni (lunedì della settimana successiva se preferisci specifica il giorno).',
    }
  }

  if (s === 'fine mese' || s === 'a fine mese') {
    const [y, m] = today.split('-').map(Number)
    const last = new Date(y, m, 0, 12, 0, 0, 0)
    return { date: formatDateOnly(last) }
  }

  const nextWd = parseItalianNextWeekdayPhrase(s)
  if (nextWd) return { date: nextWd }

  const bareWd = s.match(
    /^(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(\s+prossim[oa]?)?$/i
  )
  if (bareWd) {
    const key = bareWd[1].toLowerCase().normalize('NFD').replace(/\u0300/g, '')
    const wd = WEEKDAY[key]
    if (wd !== undefined) {
      const allowToday = false
      return { date: nextWeekdayFrom(today, wd, allowToday) }
    }
  }

  const abs = parseItalianDatePhrase(s, Number(today.slice(0, 4)))
  if (abs) return { date: abs }

  if (opts?.ambiguousAsNull) return { date: null, ambiguous: true }
  return { date: null, ambiguous: true }
}

export function formatDateItFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

export { todayDateOnlyRome }
