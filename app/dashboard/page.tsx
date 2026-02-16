import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { DashboardStats } from '@/components/dashboard/dashboard-stats'

export default async function DashboardPage() {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  // Inizializza con valori di default
  let totalClients = 0
  let totalWorks = 0
  let worksInDeadline: any[] = []
  let expiredWorks: any[] = []
  let inReviewWorks: any[] = []

  // Prova a caricare i dati dal database
  try {
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    totalClients = await prisma.client.count()
    totalWorks = await prisma.work.count()
    
      worksInDeadline = await prisma.work.findMany({
        where: {
          deadline: {
            gte: now,
            lte: sevenDaysFromNow,
          },
          status: {
            not: 'DONE',
          },
        },
        include: {
          client: true,
          category: true,
          assignedTo: true,
        },
        take: 10,
      })

      expiredWorks = await prisma.work.findMany({
        where: {
          deadline: {
            lt: now,
          },
          status: {
            not: 'DONE',
          },
        },
        include: {
          client: true,
          category: true,
          assignedTo: true,
        },
        take: 10,
      })

      inReviewWorks = await prisma.work.findMany({
        where: {
          status: {
            in: ['IN_REVIEW', 'WAITING_CLIENT'],
          },
        },
        include: {
          client: true,
          category: true,
          assignedTo: true,
        },
        take: 10,
      })
  } catch (error: any) {
    // Se c'è un errore, usa valori di default
    console.error('Database error:', error?.message)
  }

  return (
    <div
      className="min-h-screen bg-dark p-6"
      style={{ minHeight: '100vh', backgroundColor: 'var(--dark, #0c0e11)', color: '#fff', padding: '1.5rem' }}
    >
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white" style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1.5rem', color: '#fff' }}>Dashboard</h1>
        <DashboardStats
          totalClients={totalClients}
          totalWorks={totalWorks}
          worksInDeadline={worksInDeadline}
          expiredWorks={expiredWorks}
          inReviewWorks={inReviewWorks}
        />
      </div>
    </div>
  )
}
