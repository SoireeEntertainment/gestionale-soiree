import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed utenti: 5 Admin + 2 Agente (solo lettura clienti e preventivi)
  const admins = [
    { name: 'Davide Piccolo', email: 'davide@soiree.it', role: 'ADMIN' },
    { name: 'Cristian Palazzolo', email: 'cristian.palazzolo@soiree.it', role: 'ADMIN' },
    { name: 'Enrico Cairoli', email: 'enrico@soiree.it', role: 'ADMIN' },
    { name: 'Daniele Mirante', email: 'daniele@soiree.it', role: 'ADMIN' },
    { name: 'Alessia Pilutzu', email: 'alessia@soiree.it', role: 'ADMIN' },
  ]
  const agenti = [
    { name: 'Agente 1', email: 'agente1@soiree.studio', role: 'AGENTE' },
    { name: 'Agente 2', email: 'agente2@soiree.studio', role: 'AGENTE' },
  ]

  for (const user of [...admins, ...agenti]) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: user,
    })
  }

  // Disattiva vecchi utenti con email @soiree.studio o placeholder
  await prisma.user.updateMany({
    where: {
      email: {
        in: [
          'utente2@soiree.studio', 'utente3@soiree.studio', 'utente4@soiree.studio', 'utente5@soiree.studio',
          'davide@soiree.studio', 'cristian.palazzolo@soiree.studio', 'enrico.cairoli@soiree.studio',
          'daniele.mirante@soiree.studio', 'alessia.pilutzu@soiree.studio',
        ],
      },
    },
    data: { isActive: false },
  })

  console.log('✅ Users seeded successfully')

  // Seed categorie
  const categories = [
    { name: 'Social', description: 'Gestione social media e contenuti' },
    { name: 'ADV', description: 'Pubblicità e campagne marketing' },
    { name: 'Foto/Video', description: 'Produzione fotografica e video' },
    { name: 'Website', description: 'Sviluppo e gestione siti web' },
    { name: 'Grafica', description: 'Design grafico e branding' },
  ]

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    })
  }

  console.log('✅ Categories seeded successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

