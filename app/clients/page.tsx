import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { ClientsList } from '@/components/clients/clients-list'

export default async function ClientsPage() {
  const user = await requireAuth()

  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      include: { assignedTo: true },
      orderBy: { name: 'asc' },
    }),
    getUsers(),
  ])

  const canWrite = user.role === 'ADMIN'

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Clienti</h1>
        </div>
        <ClientsList clients={clients} users={users} canWrite={canWrite} />
      </div>
    </div>
  )
}

