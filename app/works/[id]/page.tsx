import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getWork } from '@/app/actions/works'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'
import { WorkDetail } from '@/components/works/work-detail'

export default async function WorkDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const { id } = await props.params
  const [work, clients, categories, users] = await Promise.all([
    getWork(id),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    getUsers(),
  ])

  if (!work) redirect('/works')

  return <WorkDetail work={work} clients={clients} categories={categories} users={users} />
}

