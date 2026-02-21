/**
 * Importa le scadenze domini unmatched usando la mappatura dominio → nome cliente.
 * Crea i clienti se non esistono, poi upsert scadenza + attiva Website.
 * Esegui: npx tsx scripts/import-domain-expiries-mapped.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Mappatura dominio → nome cliente (da lista fornita dall'utente). */
const DOMAIN_TO_CLIENT_NAME: { domain: string; expiresAt: string; clientName: string }[] = [
  { domain: 'icitta.net', expiresAt: '2026-02-24', clientName: 'iCittà' },
  { domain: 'anticoforno2-0.it', expiresAt: '2026-03-12', clientName: 'Antico Forno 2.0' },
  { domain: 'rigertape.com', expiresAt: '2026-03-04', clientName: 'RigerTape' },
  { domain: 'vespaexperience.com', expiresAt: '2026-02-26', clientName: 'Kalitumba Travel' },
  { domain: 'carmagnolamarmi.it', expiresAt: '2026-03-15', clientName: 'Carmagnola Marmi' },
  { domain: 'molineris.it', expiresAt: '2026-02-27', clientName: 'Molieneris' },
  { domain: 'faitorino.it', expiresAt: '2026-03-01', clientName: 'FAI Torino' },
  { domain: 'bohobeautyhome.it', expiresAt: '2027-01-24', clientName: 'Boho Beauty Home' },
  { domain: 'victorybludrink.it', expiresAt: '2026-12-22', clientName: 'Victory Blu Drink' },
  { domain: 'victoryblu.it', expiresAt: '2026-12-15', clientName: 'Victory Blu Drink' },
  { domain: 'snelloo.it', expiresAt: '2026-11-14', clientName: 'Snelloo' },
  { domain: 'bigaristoranteasti.it', expiresAt: '2026-09-08', clientName: 'Biga Asti' },
  { domain: 'bigahamburgerie.it', expiresAt: '2026-08-26', clientName: 'ItalBiga' },
  { domain: 'bigapizzerie.it', expiresAt: '2026-08-26', clientName: 'ItalBiga' },
  { domain: 'bigaristoranti.it', expiresAt: '2026-08-26', clientName: 'ItalBiga' },
  { domain: 'italbiga.it', expiresAt: '2026-08-26', clientName: 'ItalBiga' },
  { domain: 'bigalovers.it', expiresAt: '2026-08-26', clientName: 'ItalBiga' },
  { domain: 'asdeuritmcia.it', expiresAt: '2026-08-14', clientName: 'ASD Euritmica' },
  { domain: 'euritmicteam.it', expiresAt: '2026-08-14', clientName: 'ASD Euritmica' },
  { domain: 'cascinamorelli1862.it', expiresAt: '2026-07-23', clientName: 'Cascina Morelli 1862' },
  { domain: 'cascinamorelli.it', expiresAt: '2026-07-23', clientName: 'Cascina Morelli 1862' },
  { domain: 'otticaronco.it', expiresAt: '2026-06-20', clientName: 'Ottica Ronco' },
  { domain: 'moramarcogroup.com', expiresAt: '2027-05-31', clientName: 'Moramarco Group' },
  { domain: 'inecotech.com', expiresAt: '2027-05-31', clientName: 'Inecotech' },
  { domain: 'rigertape.it', expiresAt: '2026-05-21', clientName: 'Riger Tape' },
  { domain: 'talentotorino.it', expiresAt: '2026-05-20', clientName: 'Talento Torino' },
  { domain: 'progettococoon.it', expiresAt: '2026-05-08', clientName: 'Cocoon' },
  { domain: 'bigapizzeria.it', expiresAt: '2026-05-06', clientName: 'ItalBiga' },
  { domain: 'climatizzatoricarmagnola.it', expiresAt: '2026-04-30', clientName: 'Daniel Munzone' },
  { domain: 'danyimpianti.it', expiresAt: '2026-04-30', clientName: 'Daniel Munzone' },
  { domain: 'guerrieriarredamenti.it', expiresAt: '2026-04-17', clientName: 'Guerrieri Arredamenti' },
  { domain: 'morasiabrand.com', expiresAt: '2027-03-19', clientName: 'Morasia' },
  { domain: 'morasia.org', expiresAt: '2027-03-19', clientName: 'Morasia' },
  { domain: 'immobiliarecasellogroup.com', expiresAt: '2026-12-03', clientName: 'Immobiliare Castello' },
  { domain: 'valentinapignata.it', expiresAt: '2026-11-27', clientName: 'Valentina Pignata' },
  { domain: 'albawhitetruffle.com', expiresAt: '2026-11-20', clientName: 'Alba White Truffle' },
  { domain: 'dolcissimaarte.it', expiresAt: '2026-10-31', clientName: 'Dolcissima' },
  { domain: 'onandoff.it', expiresAt: '2026-09-25', clientName: 'onandoff' },
  { domain: 'legnamitavella.it', expiresAt: '2026-09-12', clientName: 'Legnami Tavella' },
  { domain: 'lafamigliacarmagna.it', expiresAt: '2026-07-28', clientName: 'La Famiglia Caramagna' },
  { domain: 'vogliadipizzafalcone.it', expiresAt: '2026-07-09', clientName: 'Voglia di Pizza Candiolo' },
  { domain: 'ferrari-music.it', expiresAt: '2026-07-25', clientName: 'Ferrari Music' },
  { domain: 'legnamitavella.com', expiresAt: '2026-05-14', clientName: 'Legnami Tavella' },
  { domain: 'premierclubventi.it', expiresAt: '2026-03-30', clientName: 'Premiere Club' },
  { domain: 'email-morando-trasporti.it', expiresAt: '2026-03-30', clientName: 'Morando Trasporti' },
  { domain: 'villaaurorabnbcarmagnola.it', expiresAt: '2026-03-22', clientName: 'Villa Aurora BnB Carmagnola' },
  { domain: 'countryhousebnbcarmagnola.it', expiresAt: '2026-03-22', clientName: 'Country House BnB Carmagnola' },
  { domain: 'missburocrazia.it', expiresAt: '2026-03-21', clientName: 'Miss Burocrazia' },
  { domain: 'dolcissimaarte.com', expiresAt: '2026-10-31', clientName: 'Dolcissima' },
  { domain: 'nigrofrigo.it', expiresAt: '2026-10-24', clientName: 'Nigro Frigo' },
  { domain: 'osteriadelvapore.it', expiresAt: '2026-10-21', clientName: 'Osteria del Vapore' },
  { domain: 'dolcissimarte.it', expiresAt: '2026-09-27', clientName: 'Dolcissima' },
  { domain: 'legadellacoppetta.com', expiresAt: '2026-07-18', clientName: 'Lega della Coppetta' },
  { domain: 'duccarmagnola.it', expiresAt: '2026-07-04', clientName: 'DUC Carmagnola' },
  { domain: 'elledfc.it', expiresAt: '2027-02-18', clientName: "Elledì FC" },
  { domain: 'pizzacarmagnola.it', expiresAt: '2026-03-29', clientName: 'Antico Forno 2.0' },
  { domain: 'panetteriacarmagnola.it', expiresAt: '2026-03-29', clientName: 'Antico Forno 2.0' },
  { domain: 'osteopatacarmagnola.it', expiresAt: '2026-03-22', clientName: 'Andrea Canavesio' },
  { domain: 'massoterapistacarmagnola.it', expiresAt: '2026-03-22', clientName: 'Andrea Canavesio' },
  { domain: 'sophiebeautylounge.it', expiresAt: '2026-11-13', clientName: 'Sophie Beauty Lounge' },
  { domain: 'alessandromorelli.com', expiresAt: '2026-11-12', clientName: 'Alessandro Morelli' },
  { domain: 'vivirivarolo.com', expiresAt: '2026-07-06', clientName: 'DUC Rivarolo' },
  { domain: 'bowlingroletto.it', expiresAt: '2026-07-05', clientName: 'Mirabowling' },
  { domain: 'pineroll.it', expiresAt: '2026-06-23', clientName: 'Pineroll' },
  { domain: 'olisticamenteaurora.it', expiresAt: '2026-05-28', clientName: 'Olisticamente' },
  { domain: 'latanadeiconigli.it', expiresAt: '2026-04-17', clientName: 'La Tana dei Conigli' },
  { domain: 'theroomfitness.it', expiresAt: '2026-11-10', clientName: 'The Room' },
  { domain: 'olisticamentecarmagnola.it', expiresAt: '2026-10-19', clientName: 'Olisticamente' },
  { domain: 'marcodeglinnocenti.it', expiresAt: '2026-08-05', clientName: "Marco Degl'Innocenti" },
  { domain: 'brcdistribuzione.it', expiresAt: '2027-02-18', clientName: 'Barcelona' },
]

const DOMAIN_SERVICE_PREFIX = 'Dominio: '
const IMPORT_NOTES = 'Import domini (mappatura manuale)'

function normalizeNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

function toDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z')
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${s}`)
  return d
}

async function findClientByName(name: string, clients: { id: string; name: string }[]): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeNameForMatch(name)
  for (const c of clients) {
    if (normalizeNameForMatch(c.name) === normalized) return c
  }
  for (const c of clients) {
    if (normalizeNameForMatch(c.name).includes(normalized) || normalized.includes(normalizeNameForMatch(c.name))) return c
  }
  return null
}

async function findOrCreateClient(clientName: string): Promise<string> {
  const existing = await prisma.client.findMany({ select: { id: true, name: true } })
  const found = await findClientByName(clientName, existing)
  if (found) return found.id
  const created = await prisma.client.create({
    data: { name: clientName.trim() },
    select: { id: true },
  })
  console.log('  Creato cliente:', clientName.trim())
  return created.id
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
  console.log('Import scadenze domini con mappatura manuale (find-or-create clienti)...\n')

  let created = 0
  let updated = 0

  for (const row of DOMAIN_TO_CLIENT_NAME) {
    const clientId = await findOrCreateClient(row.clientName)
    const serviceName = DOMAIN_SERVICE_PREFIX + row.domain
    const renewalDate = toDate(row.expiresAt)

    const existing = await prisma.clientRenewal.findUnique({
      where: { clientId_serviceName: { clientId, serviceName } },
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
          clientId,
          serviceName,
          renewalDate,
          billingDate: null,
          notes: IMPORT_NOTES,
        },
      })
      created++
    }

    await ensureWebsiteCategory(clientId)
  }

  console.log('\n--- Report ---')
  console.log('Scadenze create:', created)
  console.log('Scadenze aggiornate:', updated)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
