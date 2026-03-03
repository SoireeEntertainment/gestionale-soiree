import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { ClientsList } from '@/components/clients/clients-list'

export default async function ClientsPage() {
  const user = await requireAuth()

  let clients: Awaited<ReturnType<typeof prisma.client.findMany>>
  try {
    clients = await prisma.client.findMany({
      include: { assignedTo: true },
      orderBy: { name: 'asc' },
    })
  } catch (err) {
    console.warn('[ClientsPage] findMany with full schema failed, using minimal select:', err instanceof Error ? err.message : err)
    clients = (await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        assignedToUserId: true,
        assignedTo: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    })) as unknown as Awaited<ReturnType<typeof prisma.client.findMany>>
  }

  const users = await getUsers()

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

