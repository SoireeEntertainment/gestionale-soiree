/**
 * Parsing e normalizzazione domini per "Scadenze e Rinnovi".
 * Compatibile con record legacy (dominio nel serviceName) e nuovo campo `domain`.
 */

/** Hostname valido (anche www / sottodomini). Niente path, spazi, protocollo. */
const DOMAIN_HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

/**
 * Normalizza un input utente a hostname lowercase.
 * - trim, lowercase
 * - rimuove http(s)://
 * - rimuove path / slash finali
 * Ritorna null se vuoto o non valido.
 */
export function normalizeDomainInput(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let s = String(raw).trim().toLowerCase()
  if (!s) return null

  s = s.replace(/^https?:\/\//i, '')
  // slash finali soli → ok (es. esempio.it/)
  s = s.replace(/\/+$/, '')

  // Se resta un path (slash dopo l'host), rifiuta
  if (s.includes('/')) return null
  if (s.includes('?') || s.includes('#')) return null
  if (/\s/.test(s)) return null

  // eventuale porta: rimuovi
  s = s.replace(/:\d+$/, '')
  s = s.replace(/\.+$/, '')
  s = s.trim()

  if (!s) return null
  if (!DOMAIN_HOSTNAME_RE.test(s)) return null

  return s
}

/** Estrae il dominio da nomi tipo "Dominio: esempio.it", "Dominio - esempio.it", ecc. */
export function parseDomainFromServiceName(serviceName: string): string | null {
  const s = serviceName.trim()
  if (!s) return null

  const colon = s.match(/^dominio\s*:\s*(.+)$/i)
  if (colon) return normalizeDomainInput(colon[1])

  const dash = s.match(/^dominio\s*-\s*(.+)$/i)
  if (dash) return normalizeDomainInput(dash[1])

  const space = s.match(/^dominio\s+(.+)$/i)
  if (space) return normalizeDomainInput(space[1])

  return null
}

/** True se il serviceName è nel formato legacy "Dominio: …" / "Dominio - …" / "Dominio …". */
export function isDomainRenewalService(serviceName: string): boolean {
  return parseDomainFromServiceName(serviceName) !== null
}

/** True se il nome servizio suggerisce un rinnovo dominio (anche solo "Dominio"). */
export function serviceNameSuggestsDomain(serviceName: string): boolean {
  return /^dominio\b/i.test(serviceName.trim())
}

/**
 * Risolve il dominio di un rinnovo:
 * 1) campo `domain` se valorizzato
 * 2) altrimenti parser legacy su serviceName
 */
export function resolveRenewalDomain(renewal: {
  domain?: string | null
  serviceName: string
}): string | null {
  const fromField = normalizeDomainInput(renewal.domain)
  if (fromField) return fromField
  return parseDomainFromServiceName(renewal.serviceName)
}

/**
 * Un record è un rinnovo dominio se:
 * - ha `domain` valorizzato, oppure
 * - il serviceName è riconosciuto dalla logica legacy
 */
export function isDomainRenewalRecord(renewal: {
  domain?: string | null
  serviceName: string
}): boolean {
  if (normalizeDomainInput(renewal.domain)) return true
  return isDomainRenewalService(renewal.serviceName)
}
