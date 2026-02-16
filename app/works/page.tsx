import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getWorks } from '@/app/actions/works'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { WorksList } from '@/components/works/works-list'

export default async function WorksPage(props: {
  searchParams: Promise<{ clientId?: string; categoryId?: string; status?: string; deadlineFilter?: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const searchParams = await props.searchParams
  const [works, clients, categories, users] = await Promise.all([
    getWorks({
      clientId: searchParams.clientId,
      categoryId: searchParams.categoryId,
      status: searchParams.status,
      deadlineFilter: searchParams.deadlineFilter as any,
    }),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Lavori</h1>
        </div>
        <WorksList
          works={works}
          clients={clients}
          categories={categories}
          users={users}
          filters={searchParams as Record<string, string | undefined>}
        />
      </div>
    </div>
  )
}

