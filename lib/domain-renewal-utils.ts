/**
 * Parsing nomi servizio "Scadenze e Rinnovi" per voci dominio.
 */

/** Estrae il dominio da nomi tipo "Dominio: esempio.it", "Dominio - esempio.it", ecc. */
export function parseDomainFromServiceName(serviceName: string): string | null {
  const s = serviceName.trim()
  if (!s) return null

  const colon = s.match(/^dominio\s*:\s*(.+)$/i)
  if (colon) return colon[1].trim()

  const dash = s.match(/^dominio\s*-\s*(.+)$/i)
  if (dash) return dash[1].trim()

  const space = s.match(/^dominio\s+(.+)$/i)
  if (space) return space[1].trim()

  return null
}

export function isDomainRenewalService(serviceName: string): boolean {
  return parseDomainFromServiceName(serviceName) !== null
}
