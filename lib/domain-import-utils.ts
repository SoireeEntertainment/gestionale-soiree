/** Utilità pure per import domini (matching e parsing). Usate da server actions. */

export type DomainImportRow = {
  domain: string
  expiryDate: string
}

export type ClientForMatch = { id: string; name: string }

/** Estrae slug base dal dominio: rimuove TLD, sostituisce - e _ con spazi, lowercase. */
function domainToSlug(domain: string): string {
  const lower = domain.trim().toLowerCase()
  const withoutTld = lower.replace(/\.(it|com|net|org|eu|io|co|info|biz|dev)$/i, '')
  return withoutTld.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Normalizza nome cliente per confronto: lowercase, spazi multipli → uno. */
function clientNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Confronto "senza spazi" per match tipo mcdentalteam ↔ MC Dental Team. */
function slugCompact(s: string): string {
  return s.replace(/\s+/g, '')
}

export function getDomainMatchCandidates(domain: string, clients: ClientForMatch[]): ClientForMatch[] {
  const domainSlug = domainToSlug(domain)
  const domainCompact = slugCompact(domainSlug)
  if (!domainSlug) return []

  const candidates: ClientForMatch[] = []
  for (const client of clients) {
    const clientSlug = clientNameToSlug(client.name)
    const clientCompact = slugCompact(clientSlug)
    const exactMatch = domainSlug === clientSlug
    const compactMatch = domainCompact === clientCompact
    const clientContainsDomain = clientSlug.includes(domainSlug) || domainSlug.includes(clientSlug)
    const compactContains =
      clientCompact.includes(domainCompact) || domainCompact.includes(clientCompact)
    if (exactMatch || compactMatch || (clientContainsDomain && clientSlug.length > 2) || (compactContains && domainCompact.length > 2)) {
      candidates.push(client)
    }
  }
  return candidates
}

/**
 * Trova il cliente corrispondente al dominio. Nessun nuovo cliente.
 * - Match forte: slug dominio === slug cliente, oppure slugCompact uguale.
 * - Se 2+ clienti possibili → 'ambiguous'
 * - Se nessuno → null
 */
export function matchDomainToClient(
  domain: string,
  clients: ClientForMatch[]
): { clientId: string; clientName: string } | 'ambiguous' | null {
  const candidates = getDomainMatchCandidates(domain, clients)
  if (candidates.length === 0) return null
  if (candidates.length > 1) return 'ambiguous'
  return { clientId: candidates[0].id, clientName: candidates[0].name }
}

/**
 * Parsing input: righe in formato dominio.tld | YYYY-MM-DD o dominio.tld,YYYY-MM-DD.
 * Bonus: estrae dominio + data con regex da testo grezzo.
 */
export function parseDomainsInput(text: string): DomainImportRow[] {
  const seen = new Set<string>()
  const result: DomainImportRow[] = []
  const dateRegex = /\b(\d{4}-\d{2}-\d{2})\b/

  function add(domain: string, expiryDate: string) {
    const d = domain.trim().toLowerCase()
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) && !seen.has(d)) {
      seen.add(d)
      result.push({ domain: d, expiryDate })
    }
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    const pipeOrComma = line.match(/^([^|,]+)[|,]\s*(\d{4}-\d{2}-\d{2})\s*$/)
    if (pipeOrComma) {
      add(pipeOrComma[1], pipeOrComma[2])
      continue
    }

    const withDelim = [...line.matchAll(/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\s*[|,]\s*(\d{4}-\d{2}-\d{2})/gi)]
    for (const m of withDelim) {
      add(m[1], m[2])
    }
    if (withDelim.length > 0) continue

    const dateInLine = line.match(dateRegex)
    const expiryDate = dateInLine ? dateInLine[1] : ''
    const domainInLine = line.match(/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)
    if (domainInLine && expiryDate) {
      for (const d of [...new Set(domainInLine.map((x) => x.trim().toLowerCase()))]) {
        add(d, expiryDate)
      }
    }
  }

  return result
}
