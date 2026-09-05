/**
 * Utility per date concettualmente date-only (YYYY-MM-DD),
 * tipicamente salvate come UTC midnight (…T00:00:00.000Z).
 */

/** YYYY-MM-DD dal componente UTC della Date (evita shift ±1 giorno). */
export function toDateOnlyString(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Formato visualizzazione it-IT (dd/MM/yyyy) senza dipendere dal timezone locale. */
export function formatDateOnlyIt(d: Date): string {
  const [y, m, day] = toDateOnlyString(d).split('-')
  return `${day}/${m}/${y}`
}

/** Oggi come YYYY-MM-DD nel timezone locale del browser/runtime. */
export function todayDateOnlyLocal(): string {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const day = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Differenza in giorni (calendar) tra due YYYY-MM-DD: a - b. */
export function diffDaysDateOnly(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const aMs = Date.UTC(ay, am - 1, ad)
  const bMs = Date.UTC(by, bm - 1, bd)
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000))
}
