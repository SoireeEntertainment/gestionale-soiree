/**
 * Script one-shot: importa scadenze domini da DOMAIN_EXPIRIES nelle schede cliente.
 * - Match dominio → cliente con regole deterministiche (NON crea clienti).
 * - Upsert scadenza (Dominio: <domain>, renewalDate, billingDate null).
 * - Attiva categoria Website per i clienti coinvolti.
 * Esegui: npx tsx scripts/import-domain-expiries.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DOMAIN_EXPIRIES: { domain: string; expiresAt: string }[] = [
  { domain: 'old-carlomagnolalaboratori.com', expiresAt: '2026-03-09' },
  { domain: 'icitta.net', expiresAt: '2026-02-24' },
  { domain: 'anticoforno2-0.it', expiresAt: '2026-03-12' },
  { domain: 'realemutuacarmagnola.it', expiresAt: '2026-03-02' },
  { domain: 'v-mat-design.it', expiresAt: '2026-02-22' },
  { domain: 'rigertape.com', expiresAt: '2026-03-04' },
  { domain: 'v-mat-racing.it', expiresAt: '2026-02-22' },
  { domain: 'v-mat-service.it', expiresAt: '2026-02-22' },
  { domain: 'vespaexperience.com', expiresAt: '2026-02-26' },
  { domain: 'carmagnolamarmi.it', expiresAt: '2026-03-15' },
  { domain: 'molineris.it', expiresAt: '2026-02-27' },
  { domain: 'faitorino.it', expiresAt: '2026-03-01' },
  { domain: 'bohobeautyhome.it', expiresAt: '2027-01-24' },
  { domain: 'victorybludrink.it', expiresAt: '2026-12-22' },
  { domain: 'victoryblu.it', expiresAt: '2026-12-15' },
  { domain: 'snelloo.it', expiresAt: '2026-11-14' },
  { domain: 'movipadel.it', expiresAt: '2026-10-30' },
  { domain: 'bigaristoranteasti.it', expiresAt: '2026-09-08' },
  { domain: 'bigahamburgerie.it', expiresAt: '2026-08-26' },
  { domain: 'bigapizzerie.it', expiresAt: '2026-08-26' },
  { domain: 'bigaristoranti.it', expiresAt: '2026-08-26' },
  { domain: 'italbiga.it', expiresAt: '2026-08-26' },
  { domain: 'bigalovers.it', expiresAt: '2026-08-26' },
  { domain: 'asdeuritmcia.it', expiresAt: '2026-08-14' },
  { domain: 'euritmicteam.it', expiresAt: '2026-08-14' },
  { domain: 'cascinamorelli1862.it', expiresAt: '2026-07-23' },
  { domain: 'cascinamorelli.it', expiresAt: '2026-07-23' },
  { domain: 'costantiniautomobili.it', expiresAt: '2026-07-22' },
  { domain: 'otticaronco.it', expiresAt: '2026-06-20' },
  { domain: 'wokoza.com', expiresAt: '2026-06-18' },
  { domain: 'wokoza.it', expiresAt: '2026-06-18' },
  { domain: 'moramarcogroup.com', expiresAt: '2027-05-31' },
  { domain: 'inecotech.com', expiresAt: '2027-05-31' },
  { domain: 'rigertape.it', expiresAt: '2026-05-21' },
  { domain: 'talentotorino.it', expiresAt: '2026-05-20' },
  { domain: 'progettococoon.it', expiresAt: '2026-05-08' },
  { domain: 'bigapizzeria.it', expiresAt: '2026-05-06' },
  { domain: 'climatizzatoricarmagnola.it', expiresAt: '2026-04-30' },
  { domain: 'danyimpianti.it', expiresAt: '2026-04-30' },
  { domain: 'guerrieriarredamenti.it', expiresAt: '2026-04-17' },
  { domain: 'morasiabrand.com', expiresAt: '2027-03-19' },
  { domain: 'morasia.org', expiresAt: '2027-03-19' },
  { domain: 'rinlux.it', expiresAt: '2027-02-06' },
  { domain: 'arneisgiropizza.it', expiresAt: '2027-01-02' },
  { domain: 'immobiliarecasellogroup.com', expiresAt: '2026-12-03' },
  { domain: 'valentinapignata.it', expiresAt: '2026-11-27' },
  { domain: 'fbcfrossasco.it', expiresAt: '2026-11-27' },
  { domain: 'albawhitetruffle.com', expiresAt: '2026-11-20' },
  { domain: 'dolcissimaarte.it', expiresAt: '2026-10-31' },
  { domain: 'onandoff.it', expiresAt: '2026-09-25' },
  { domain: 'legnamitavella.it', expiresAt: '2026-09-12' },
  { domain: 'lafamigliacarmagna.it', expiresAt: '2026-07-28' },
  { domain: 'vogliadipizzafalcone.it', expiresAt: '2026-07-09' },
  { domain: 'rinlux.com', expiresAt: '2026-05-27' },
  { domain: 'ferrari-music.it', expiresAt: '2026-07-25' },
  { domain: 'legnamitavella.com', expiresAt: '2026-05-14' },
  { domain: 'vahinecentroestetico.it', expiresAt: '2026-04-24' },
  { domain: 'premierclubventi.it', expiresAt: '2026-03-30' },
  { domain: 'email-morando-trasporti.it', expiresAt: '2026-03-30' },
  { domain: 'villaaurorabnbcarmagnola.it', expiresAt: '2026-03-22' },
  { domain: 'countryhousebnbcarmagnola.it', expiresAt: '2026-03-22' },
  { domain: 'missburocrazia.it', expiresAt: '2026-03-21' },
  { domain: 'kalitumbatravel.it', expiresAt: '2027-02-10' },
  { domain: 'assi33.it', expiresAt: '2027-01-26' },
  { domain: 'dolcissimaarte.com', expiresAt: '2026-10-31' },
  { domain: 'nigrofrigo.it', expiresAt: '2026-10-24' },
  { domain: 'osteriadelvapore.it', expiresAt: '2026-10-21' },
  { domain: 'dolcissimarte.it', expiresAt: '2026-09-27' },
  { domain: 'premiereclub.it', expiresAt: '2026-05-25' },
  { domain: 'legadellacoppetta.com', expiresAt: '2026-07-18' },
  { domain: 'duccarmagnola.it', expiresAt: '2026-07-04' },
  { domain: 'elledfc.it', expiresAt: '2027-02-18' },
  { domain: 'pizzacarmagnola.it', expiresAt: '2026-03-29' },
  { domain: 'panetteriacarmagnola.it', expiresAt: '2026-03-29' },
  { domain: 'osteopatacarmagnola.it', expiresAt: '2026-03-22' },
  { domain: 'massoterapistacarmagnola.it', expiresAt: '2026-03-22' },
  { domain: 'sophiebeautylounge.it', expiresAt: '2026-11-13' },
  { domain: 'alessandromorelli.com', expiresAt: '2026-11-12' },
  { domain: 'vivirivarolo.com', expiresAt: '2026-07-06' },
  { domain: 'bowlingroletto.it', expiresAt: '2026-07-05' },
  { domain: 'pineroll.it', expiresAt: '2026-06-23' },
  { domain: 'farmaciasantaritacarmagnola.it', expiresAt: '2026-06-11' },
  { domain: 'farmaciacarmagnola.it', expiresAt: '2026-05-28' },
  { domain: 'olisticamenteaurora.it', expiresAt: '2026-05-28' },
  { domain: 'latanadeiconigli.it', expiresAt: '2026-04-17' },
  { domain: 'shoro.it', expiresAt: '2026-12-08' },
  { domain: 'theroomfitness.it', expiresAt: '2026-11-10' },
  { domain: 'olisticamentecarmagnola.it', expiresAt: '2026-10-19' },
  { domain: 'marcodeglinnocenti.it', expiresAt: '2026-08-05' },
  { domain: 'qualityburger.it', expiresAt: '2026-07-17' },
  { domain: 'barcelonacarmagnola.it', expiresAt: '2026-07-07' },
  { domain: 'centro1861.it', expiresAt: '2026-07-07' },
  { domain: 'brcdistribuzione.it', expiresAt: '2027-02-18' },
]

const DOMAIN_SERVICE_PREFIX = 'Dominio: '
const IMPORT_NOTES = 'Import domini (script)'

type ClientRow = { id: string; name: string }

/** Normalizza dominio: lowercase, rimuovi TLD, - e _ → spazio, rimuovi www/old/email, collapse spazi. */
function domainToBase(domain: string): string {
  let s = domain.trim().toLowerCase()
  s = s.replace(/\.(it|com|net|org|eu|io|co|info|biz|dev|shop|xyz|fun|app|cloud|online|tech|site|store|website|agency|solutions|company|digital)$/i, '')
  s = s.replace(/[-_]/g, ' ')
  const stopWords = ['www', 'old', 'email']
  stopWords.forEach((w) => {
    const re = new RegExp(`\\b${w}\\b`, 'gi')
    s = s.replace(re, '')
  })
  return s.replace(/\s+/g, ' ').trim()
}

/** Normalizza nome cliente: lowercase, no accenti, collapse spazi. */
function clientNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugCompact(s: string): string {
  return s.replace(/\s+/g, '')
}

/**
 * Regole speciali: dominio → possibili nomi cliente da cercare (esatti o contenuti).
 * Se il dominio rientra in una regola, cerchiamo solo clienti il cui nome matcha uno di questi.
 */
function getSpecialCaseClientNames(domain: string): string[] | null {
  const base = domainToBase(domain)
  const lower = domain.toLowerCase()

  if (lower.startsWith('v-mat-') || lower === 'v-mat.it' || lower === 'v-mat.com') return ['V-mat', 'V-Mat', 'v-mat']
  if (lower.includes('victoryblu')) return ['Victory', 'Victory Blu']
  if (lower.startsWith('rinlux')) return ['Rinlux']
  if (lower.includes('cascinamorelli')) return ['Cascina Morelli']
  if (lower.startsWith('biga') || lower.startsWith('italbiga')) return ['Biga']
  if (lower.startsWith('rigertape')) return ['Rigertape', 'Riger Tape']
  if (lower === 'dolcissimaarte' || base === 'dolcissimaarte') return ['Dolcissima Arte']
  if (lower === 'dolcissimarte' || base === 'dolcissimarte') return ['Dolcissima Arte']

  return null
}

/**
 * Match dominio → cliente. Regole:
 * 1) (Opzionale) Campo website/domain sul Client: non presente nello schema, skip.
 * 2) Slug/nome normalizzato + casi speciali (v-mat, victoryblu, rinlux, cascinamorelli, biga, rigertape, dolcissima arte).
 * 3) Se multiplo → null (unmatched).
 * 4) Se nessuno → null.
 */
function matchDomainToClient(domain: string, clients: ClientRow[]): ClientRow | null {
  const special = getSpecialCaseClientNames(domain)
  const domainBase = domainToBase(domain)
  const domainCompact = slugCompact(domainBase)
  if (!domainBase) return null

  const candidates: ClientRow[] = []

  if (special) {
    for (const client of clients) {
      const nameSlug = clientNameToSlug(client.name)
      const nameCompact = slugCompact(nameSlug)
      for (const target of special) {
        const targetSlug = clientNameToSlug(target)
        if (nameSlug === targetSlug || nameCompact === slugCompact(targetSlug) || nameSlug.includes(targetSlug) || targetSlug.includes(nameSlug)) {
          candidates.push(client)
          break
        }
      }
    }
  }

  if (candidates.length === 0) {
    for (const client of clients) {
      const clientSlug = clientNameToSlug(client.name)
      const clientCompact = slugCompact(clientSlug)
      const exact = domainBase === clientSlug
      const compact = domainCompact === clientCompact
      const domainInClient = clientSlug.includes(domainBase) || domainBase.includes(clientSlug)
      const compactIn = clientCompact.includes(domainCompact) || domainCompact.includes(clientCompact)
      if (exact || compact || (domainInClient && clientSlug.length > 2) || (compactIn && domainCompact.length > 2)) {
        candidates.push(client)
      }
    }
  }

  if (candidates.length !== 1) return null
  return candidates[0]
}

function toDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z')
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${s}`)
  return d
}

async function ensureWebsiteCategory(clientId: string): Promise<void> {
  const cat = await prisma.category.findFirst({ where: { name: 'Website' } })
  if (!cat) return
  await prisma.clientCategory.upsert({
    where: { clientId_categoryId: { clientId, categoryId: cat.id } },
    create: { clientId, categoryId: cat.id, status: 'ACTIVE' },
    update: {},
  })
}

async function main() {
  console.log('Caricamento clienti...')
  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  let created = 0
  let updated = 0
  const unmatched: { domain: string; expiresAt: string }[] = []

  for (const row of DOMAIN_EXPIRIES) {
    const client = matchDomainToClient(row.domain, clients)
    if (!client) {
      unmatched.push(row)
      continue
    }

    const serviceName = DOMAIN_SERVICE_PREFIX + row.domain
    const renewalDate = toDate(row.expiresAt)

    const existing = await prisma.clientRenewal.findUnique({
      where: { clientId_serviceName: { clientId: client.id, serviceName } },
    })

    if (existing) {
      await prisma.clientRenewal.update({
        where: { id: existing.id },
        data: { renewalDate, notes: IMPORT_NOTES },
      })
      updated++
    } else {
      await prisma.clientRenewal.create({
        data: {
          clientId: client.id,
          serviceName,
          renewalDate,
          billingDate: null,
          notes: IMPORT_NOTES,
        },
      })
      created++
    }

    await ensureWebsiteCategory(client.id)
  }

  console.log('\n--- Report import domini ---')
  console.log('Creati:', created)
  console.log('Aggiornati:', updated)
  console.log('Unmatched:', unmatched.length)
  if (unmatched.length > 0) {
    console.log('\nDomini non associati (dominio | data):')
    unmatched.forEach((u) => console.log(`  ${u.domain} | ${u.expiresAt}`))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
